import fs from 'fs/promises';
import { constants } from 'fs';
import ServerAvailabilityLogController from '../SYSTEM_LOGS/controllers/server_availability_log.js';
import dotenv from 'dotenv';
dotenv.config();

export async function checkServerAvailability(req, res, next) {
    // Skip server check if environment is 'desa'
    if (process.env.ENTORNO === 'desa') {
        // Set all properties as if servers are available
        req.serversAvailable = true;
        req.serverStatus = [];
        req.availableServersCount = 0;
        req.totalServersCount = 0;
        return next();
    }

    const servers = [
        '//srv-dc-lombard.lombard.local/Approvals/',
        '//vps-file01/Approvals',
        '//srv-db-lombard/db/DOCUMENTOS',
    ];

    let availableServers = 0;
    const serverStatus = [];

    await Promise.all(servers.map(async (server) => {
        try {
            await fs.access(server, constants.F_OK);
            availableServers++;
            serverStatus.push({ server, available: true });
        } catch (err) {
            serverStatus.push({ server, available: false });
        }
    }));

    req.serversAvailable = availableServers === servers.length;
    req.serverStatus = serverStatus;
    req.availableServersCount = availableServers;
    req.totalServersCount = servers.length;

    // Log to database if any server is unavailable
    if (!req.serversAvailable) {
        try {
            await ServerAvailabilityLogController.createFromCheck(serverStatus, {
                detail: `Request at ${new Date().toISOString()} from ${req.ip || 'unknown'}`
            });
        } catch (err) {
            console.error('Error logging server availability:', err);
        }
    }

    return next();
}
