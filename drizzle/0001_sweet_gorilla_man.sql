CREATE TABLE `auditLogs` (
	`id` varchar(64) NOT NULL,
	`responderId` varchar(64) NOT NULL,
	`patientId` varchar(64) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`accessMethod` enum('QR_SCAN','USSD','OFFLINE_CACHE') NOT NULL,
	`deviceIp` varchar(45) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emergencyProfiles` (
	`id` varchar(64) NOT NULL,
	`patientId` varchar(64) NOT NULL,
	`bloodType` text NOT NULL,
	`allergies` text NOT NULL,
	`medications` text NOT NULL,
	`conditions` text NOT NULL,
	`contacts` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emergencyProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `emergencyProfiles_patientId_unique` UNIQUE(`patientId`)
);
--> statement-breakpoint
CREATE TABLE `facilities` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`district` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `facilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otpAttempts` (
	`id` varchar(64) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `otpAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otps` (
	`id` varchar(64) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`code` varchar(6) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` varchar(64) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`phoneVerified` boolean NOT NULL DEFAULT false,
	`consentGiven` boolean NOT NULL DEFAULT false,
	`consentTimestamp` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `qrCodes` (
	`id` varchar(64) NOT NULL,
	`profileId` varchar(64) NOT NULL,
	`encryptedPayload` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qrCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `qrCodes_profileId_unique` UNIQUE(`profileId`)
);
--> statement-breakpoint
CREATE TABLE `responders` (
	`id` varchar(64) NOT NULL,
	`badgeId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` enum('EMT','DOCTOR','NURSE') NOT NULL,
	`facilityId` varchar(64) NOT NULL,
	`pinHash` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `responders_id` PRIMARY KEY(`id`),
	CONSTRAINT `responders_badgeId_unique` UNIQUE(`badgeId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','responder') NOT NULL DEFAULT 'user';