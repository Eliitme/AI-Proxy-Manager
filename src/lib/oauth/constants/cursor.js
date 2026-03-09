/**
 * Cursor OAuth Configuration (Import Token from Cursor IDE)
 * Isolated so CursorService can be imported without pulling in Node's "os" from the main oauth constants.
 *
 * Cursor stores credentials in SQLite database: state.vscdb
 * Keys: cursorAuth/accessToken, storage.serviceMachineId
 */
export const CURSOR_CONFIG = {
  // API endpoints
  apiEndpoint: "https://api2.cursor.sh",
  chatEndpoint: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
  modelsEndpoint: "/aiserver.v1.AiService/GetDefaultModelNudgeData",
  // Additional endpoints
  api3Endpoint: "https://api3.cursor.sh", // Telemetry
  agentEndpoint: "https://agent.api5.cursor.sh", // Privacy mode
  agentNonPrivacyEndpoint: "https://agentn.api5.cursor.sh", // Non-privacy mode
  // Client metadata
  clientVersion: "0.48.6",
  clientType: "ide",
  // Token storage locations (for user reference)
  tokenStoragePaths: {
    linux: "~/.config/Cursor/User/globalStorage/state.vscdb",
    macos: "/Users/<user>/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
    windows: "%APPDATA%\\Cursor\\User\\globalStorage\\state.vscdb",
  },
  // Database keys
  dbKeys: {
    accessToken: "cursorAuth/accessToken",
    machineId: "storage.serviceMachineId",
  },
};
