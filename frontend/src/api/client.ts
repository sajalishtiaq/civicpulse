import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "../config/runtimeConfig";
import type { Complaint, ComplaintCreate, ComplaintListResponse, StatsResponse, Status } from "./types";

const client = axios.create({
  baseURL: API_BASE_URL,
});

export interface ApiError {
  status: number;
  message: string;
  retryAfter?: number;
}

function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: unknown }>;
    const status = axiosError.response?.status ?? 0;
    const detail = axiosError.response?.data?.detail;
    const message = typeof detail === "string" ? detail : "Something went wrong. Please try again.";
    const retryAfter = axiosError.response?.headers["retry-after"]
      ? Number(axiosError.response.headers["retry-after"])
      : undefined;
    return { status, message, retryAfter };
  }
  return { status: 0, message: "Network error. Is the server running?" };
}

export async function createComplaint(payload: ComplaintCreate): Promise<Complaint> {
  try {
    const response = await client.post<Complaint>("/api/complaints", payload);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listComplaints(params: {
  category?: string;
  priority?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<ComplaintListResponse> {
  try {
    const response = await client.get<ComplaintListResponse>("/api/complaints", { params });
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateComplaintStatus(id: string, status: Status): Promise<Complaint> {
  try {
    const response = await client.patch<Complaint>(`/api/complaints/${id}/status`, { status });
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getStats(): Promise<{ data: StatsResponse; cacheStatus: string | null }> {
  try {
    const response = await client.get<StatsResponse>("/api/stats");
    return {
      data: response.data,
      cacheStatus: response.headers["x-cache"] ?? null,
    };
  } catch (error) {
    throw toApiError(error);
  }
}