import { apiUrl } from "../config";

let refreshRequest;

function clearAccessToken() {
  localStorage.removeItem("token");
  window.dispatchEvent(new Event("auth:expired"));
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = fetch(apiUrl("/api/auth/refresh"), {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token) throw new Error("Session expired");
        localStorage.setItem("token", data.token);
        return data.token;
      })
      .catch(() => {
        clearAccessToken();
        return null;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

async function request(endpoint, options = {}, canRefresh = true) {
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

  if (
    response.status === 401 &&
    token &&
    canRefresh &&
    !/^\/auth\/(login|register|refresh|logout|verify-email|resend-verification|forgot-password|reset-password)(\?|$)/.test(
      endpoint,
    )
  ) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) return request(endpoint, options, false);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      Array.isArray(data.errors) && data.errors.length
        ? data.errors.map(({ msg }) => msg).join(". ")
        : data.error || data.message || "Request failed",
    );
    error.status = response.status;
    error.code = data.code;
    error.errors = data.errors || [];
    throw error;
  }

  return data;
}

export const api = {
  auth: {
    register: (body) =>
      request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body) =>
      request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    demoLogin: (body) =>
      request("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    logout: () => request("/auth/logout", { method: "POST" }),
    profile: () => request("/auth/profile"),
    verifyEmail: (token) =>
      request(`/auth/verify-email?${new URLSearchParams({ token })}`),
    resendVerification: (email) =>
      request("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email) =>
      request("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (body) =>
      request("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
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
      const downloadWithToken = (accessToken) =>
        fetch(apiUrl(`/api/documents/${id}/download`), {
          credentials: "include",
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        });
      let response = await downloadWithToken(token);

      if (response.status === 401 && token) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) response = await downloadWithToken(refreshedToken);
      }

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
