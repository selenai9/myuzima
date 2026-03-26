-- Prevent Updates on auditLogs
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON auditLogs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable.';
END;

-- Prevent Deletes on auditLogs
CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON auditLogs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs cannot be deleted.';
END;
