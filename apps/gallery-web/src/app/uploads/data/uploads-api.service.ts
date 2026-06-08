import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/tokens/api-base-url.token';
import {
  DirectUploadAbortRequest,
  DirectUploadAbortResponse,
  DirectUploadCompleteRequest,
  DirectUploadCompleteResponse,
  DirectUploadInitRequest,
  DirectUploadInitResponse,
  DirectUploadSignPartRequest,
  DirectUploadSignPartResponse,
  UploadPreflightRequest,
  UploadPreflightResponse,
} from './direct-upload.models';

@Injectable({ providedIn: 'root' })
export class UploadsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  uploadPreflight(request: UploadPreflightRequest): Observable<UploadPreflightResponse> {
    return this.http.post<UploadPreflightResponse>(
      `${this.apiBaseUrl}/media/upload/preflight`,
      request,
      { withCredentials: true },
    );
  }

  directUploadInit(request: DirectUploadInitRequest): Observable<DirectUploadInitResponse> {
    return this.http.post<DirectUploadInitResponse>(
      `${this.apiBaseUrl}/media/direct-upload-init`,
      request,
      { withCredentials: true },
    );
  }

  directUploadSignPart(
    request: DirectUploadSignPartRequest,
  ): Observable<DirectUploadSignPartResponse> {
    return this.http.post<DirectUploadSignPartResponse>(
      `${this.apiBaseUrl}/media/direct-upload-sign-part`,
      request,
      { withCredentials: true },
    );
  }

  directUploadComplete(
    request: DirectUploadCompleteRequest,
  ): Observable<DirectUploadCompleteResponse> {
    return this.http.post<DirectUploadCompleteResponse>(
      `${this.apiBaseUrl}/media/direct-upload-complete`,
      request,
      { withCredentials: true },
    );
  }

  directUploadAbort(request: DirectUploadAbortRequest): Observable<DirectUploadAbortResponse> {
    return this.http.post<DirectUploadAbortResponse>(
      `${this.apiBaseUrl}/media/direct-upload-abort`,
      request,
      { withCredentials: true },
    );
  }
}
