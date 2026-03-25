# MyUZIMA Deployment Guide

## Overview

MyUZIMA is a full-stack PWA (Progressive Web App) for emergency medical response in Rwanda. This guide covers deployment using Docker and Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB storage minimum
- SSL certificate (for production)

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd myuzima
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your configuration:

```bash
# Database
DATABASE_URL=mysql://myuzima:myuzima123@db:3306/myuzima
DB_PASSWORD=your-secure-password

# Security
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-32-byte-encryption-key

# OAuth
VITE_APP_ID=your-app-id
OWNER_OPEN_ID=your-owner-id
OWNER_NAME=Your Name

# Africa's Talking SMS
AFRICAS_TALKING_API_KEY=your-api-key
AFRICAS_TALKING_USERNAME=your-username
```

### 3. Generate SSL Certificates

For development:
```bash
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes
```

For production, use Let's Encrypt:
```bash
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
```

### 4. Start Services

```bash
# Build and start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
```

### 5. Database Migration

```bash
# Run migrations
docker-compose exec api npm run db:push
```

## Architecture

### Services

1. **MySQL Database** (port 3306)
   - Stores patients, profiles, responders, audit logs
   - Automatic backups recommended

2. **API Server** (port 3000)
   - Node.js Express server
   - tRPC endpoints
   - JWT authentication
   - Rate limiting

3. **Nginx Reverse Proxy** (ports 80, 443)
   - SSL/TLS termination
   - Request routing
   - Caching
   - Rate limiting

## Features

### PWA Service Worker

- **Network-first strategy** for API calls
- **Cache-first strategy** for static assets
- **Background sync** for offline audit logs
- **Push notifications** for patient alerts

### Offline Support

- IndexedDB caching of last 50 profiles
- Offline mode indicator
- Automatic sync when back online
- Queued audit logs for later submission

### Security

- AES-256-GCM encryption for sensitive data
- JWT tokens (15-min access, 7-day refresh)
- Rate limiting on auth endpoints
- RBAC for responder verification
- Immutable audit logs

### Internationalization

- Kinyarwanda (primary)
- English (secondary)
- Language toggle in UI

### USSD Support

- Africa's Talking integration
- Feature phone compatibility
- Patient registration via USSD
- Responder lookup

## Monitoring

### Health Checks

```bash
# API health
curl http://localhost:3000/api/health

# Database
docker-compose exec db mysqladmin ping -h localhost
```

### Logs

```bash
# API logs
docker-compose logs api

# Nginx logs
docker-compose logs nginx

# Database logs
docker-compose logs db
```

### Metrics

Monitor via:
- Nginx access logs: `/var/log/nginx/access.log`
- API logs: Docker logs
- Database performance: MySQL slow query log

## Backup & Recovery

### Database Backup

```bash
# Backup
docker-compose exec db mysqldump -u myuzima -p myuzima > backup.sql

# Restore
docker-compose exec -T db mysql -u myuzima -p myuzima < backup.sql
```

### Volume Backup

```bash
# Backup database volume
docker run --rm -v myuzima_db_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/db_backup.tar.gz -C /data .

# Restore
docker run --rm -v myuzima_db_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/db_backup.tar.gz -C /data
```

## Scaling

### Horizontal Scaling

For multiple API instances:

```yaml
# docker-compose.yml
services:
  api:
    deploy:
      replicas: 3
```

### Load Balancing

Nginx automatically load-balances across multiple API instances.

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs api

# Verify environment
docker-compose config

# Restart
docker-compose restart api
```

### Database Connection Error

```bash
# Check database is running
docker-compose ps db

# Verify credentials
docker-compose exec db mysql -u myuzima -p myuzima -e "SELECT 1;"
```

### High Memory Usage

```bash
# Check container stats
docker stats

# Limit memory in docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 512M
```

## Production Checklist

- [ ] Change all default passwords
- [ ] Generate secure JWT_SECRET and ENCRYPTION_KEY
- [ ] Set up SSL certificates
- [ ] Configure database backups
- [ ] Set up monitoring/alerting
- [ ] Configure log rotation
- [ ] Set NODE_ENV=production
- [ ] Enable rate limiting
- [ ] Test offline functionality
- [ ] Test push notifications
- [ ] Verify audit logs are immutable
- [ ] Test USSD integration
- [ ] Load test the system
- [ ] Set up disaster recovery plan

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Review configuration: `docker-compose config`
- Test endpoints: `curl -v http://localhost:3000/api/health`
