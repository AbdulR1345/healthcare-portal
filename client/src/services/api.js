import { apiUrl } from "../config";

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl(`/api${endpoint}`), {
    ...options,
    credentials: "include",
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (Array.isArray(data.errors) && data.errors.length) {
      throw new Error(data.errors.map(({ msg }) => msg).join(". "));
    }

    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}

export const api = {
  auth: {
    register: (body) =>
      request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body) =>
      request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    logout: () => request("/auth/logout", { method: "POST" }),
    profile: () => request("/auth/profile"),
  },
  doctors: {
    search: (params) => {
      const query = new URLSearchParams(params).toString();
      return request(`/doctors?${query}`);
    },
    assist: (query) =>
      request("/doctors/assist", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
    getById: (id) => request(`/doctors/${id}`),
    getSlots: (doctorId, date) =>
      request(`/doctors/${doctorId}/slots?date=${date}`),
  },
  appointments: {
    list: () => request("/appointments"),
    book: (body) =>
      request("/appointments", { method: "POST", body: JSON.stringify(body) }),
    updateStatus: (id, status) =>
      request(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    reschedule: (id, body) =>
      request(`/appointments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  documents: {
    list: () => request("/documents"),
    upload: (formData) =>
      request("/documents/upload", { method: "POST", body: formData }),
    summarize: (id) =>
      request(`/documents/${id}/summarize`, { method: "POST" }),
    download: async (id) => {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(apiUrl(`/api/documents/${id}/download`), {
        credentials: "include",
        headers,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || "Request failed");
      }

      return response.blob();
    },
  },
  chat: {
    conversations: () => request("/chat/conversations"),
    messages: (userId, { limit = 50, before } = {}) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set("before", before);
      return request(`/chat/${userId}?${params}`);
    },
    send: (body) =>
      request("/chat", { method: "POST", body: JSON.stringify(body) }),
  },
  admin: {
    stats: () => request("/admin/stats"),
    reminders: () => request("/admin/reminders"),
  },
};
