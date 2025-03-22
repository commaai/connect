import { Files, Route, UploadFileMetadataResponse } from "~/types";
import { fetcher } from ".";

export const getAlreadyUploadedFiles = (routeName: Route["fullname"]): Promise<Files> => 
  fetcher<Files>(`/v1/route/${routeName}/files`);

export const requestToUploadFiles = (dongleId: string, paths: string[], expiryDays: number = 7) =>
  fetcher<UploadFileMetadataResponse>(`/v1/${dongleId}/upload_urls/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiry_days: expiryDays, paths }),
  });
