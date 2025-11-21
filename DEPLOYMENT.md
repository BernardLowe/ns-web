# Deployment Guide

This document explains how to use the deployment scripts for the NS-Web application.

## Prerequisites

1. Ensure you have Git installed and configured
2. Ensure you have pnpm installed (preferred) or npm/yarn
3. Ensure you have bash shell access
4. Ensure you have appropriate permissions for the target deployment directory

## Deployment Process

### 1. Deploy Script (`deploy.sh`)

The deploy script automates the entire deployment process:

```bash
./deploy.sh
```

What the script does:
1. Pulls the latest code from the repository (main branch)
2. Updates dependencies using pnpm (falls back to npm or yarn if pnpm is not available)
3. Builds the project for production
4. Backs up the current version (if one exists) with a timestamp
5. Deploys the new version to `/usr/local/openresty/nginx/html/ns-web`
6. Sets appropriate permissions on the deployed files
7. Automatically rolls back to the previous version if deployment fails

### 2. Rollback Script (`rollback.sh`)

If you need to revert to a previous version:

```bash
./rollback.sh
```

The rollback script will:
1. List all available backups
2. Prompt you to select which backup to restore
3. Remove the current version
4. Restore the selected backup
5. Set appropriate permissions

## Directory Structure

- **Build Output**: `dist/` (local build directory)
- **Deployment Target**: `/usr/local/openresty/nginx/html/ns-web`
- **Backup Location**: `/tmp/ns-web-backups`
- **Backup Naming**: `ns-web-backup-YYYYMMDDHHMMSS`

## Troubleshooting

### "Permission denied" errors

Ensure you have the necessary permissions to:
- Write to `/usr/local/openresty/nginx/html/`
- Write to `/tmp/`

### "Command not found" errors

Ensure the following commands are available in your PATH:
- `git`
- `pnpm` (or `npm`/`yarn`)
- `bash`

### Deployment failures

If a deployment fails:
1. The script will automatically attempt to roll back to the previous version
2. Check the console output for error messages
3. Manually run the rollback script if needed

## Customization

You can modify the following variables in `deploy.sh` to suit your environment:

- `DEPLOY_TARGET`: Deployment destination directory
- `BACKUP_DIR`: Where backups are stored
- `BUILD_DIR`: Build output directory (usually `dist` for Vite projects)