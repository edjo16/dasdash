import ServerAvailabilityLogModel from '../models/server_availability_log.js';

export default class ServerAvailabilityLogController {
  static async createFromCheck(servers, options = {}) {
    // servers: array of { server: string, available: boolean }
    const total = servers.length;
    const failed = servers.filter(s => !s.available).map(s => s.server);
    const availableCount = total - failed.length;
    const failedServers = failed.join(';');
    const detail = options.detail || null;

    try {
      const id = await ServerAvailabilityLogModel.insertLog(failedServers, availableCount, total, detail);
      return { result: 1, id };
    } catch (err) {
      console.error('Failed to insert server availability log', err);
      return { result: 0, error: err.message };
    }
  }
}
