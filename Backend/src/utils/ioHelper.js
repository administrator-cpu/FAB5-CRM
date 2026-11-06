let ioInstance = null;

module.exports = {
  init: (io) => {
    ioInstance = io;
  },
  
  /**
   * Broadcast data changes globally or to specific roles
   * @param {string} event - The channel name (e.g., 'connection_changed')
   * @param {object} payload - Action type ('CREATE'/'UPDATE'/'DELETE') and target identifiers
   */
  broadcastChange: (event, payload) => {
    if (ioInstance) {
      // Every connected user receives this, so only the action goes out — record ids would let
      // anyone list other teams' connections. Clients just refetch what they're allowed to see.
      ioInstance.emit(event, { action: payload?.action });
    }
  }
};