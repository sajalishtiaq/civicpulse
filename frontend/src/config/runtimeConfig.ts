declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL: string;
    };
  }
}

export const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";