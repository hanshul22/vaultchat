import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { DirectUploadCloudinaryResponse } from './direct-upload-cloudinary.models';
import {
  DirectUploadApiService,
  DirectUploadInitResult,
  DirectUploadPartResult,
} from './direct-upload-api.service';
import {
  DirectUploadPreflightSuccessResponse,
  DirectUploadSession,
  DirectUploadUploadedPartMetadata,
  UploadPreflightResponse,
} from './direct-upload.models';
import { ExecuteDirectUploadOptions, UploadTask, UploadTaskPartInput } from './upload-task.model';
import {
  UploadTaskPhase,
  UploadTaskPreflightStatus,
  UploadTaskSessionStatus,
  UploadTaskState,
} from './upload-state.model';
import { UploadsApiService } from './uploads-api.service';

export const DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES = 95 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class UploadQueueService {
  private readonly uploadsApi = inject(UploadsApiService);
  private readonly directUploadApi = inject(DirectUploadApiService);
  private readonly useDirectCloudinaryUpload = environment.useDirectCloudinaryUpload;
  private readonly taskList = signal<UploadTask[]>([]);
  private readonly fileRegistry = new Map<string, File>();

  readonly tasks = this.taskList.asReadonly();

  addFile(file: File): UploadTask {
    const now = new Date().toISOString();
    const task: UploadTask = {
      clientId: crypto.randomUUID(),
      mediaId: crypto.randomUUID(),
      filename: file.name,
      mimeType: file.type,
      originalTotalBytes: file.size,
      totalParts: 1,
      uploadedParts: [],
      compressedTotalBytes: null,
      preflightResult: null,
      directUploadSession: null,
      completedMedia: null,
      state: this.buildState('queued'),
      createdAt: now,
      updatedAt: now,
    };

    this.fileRegistry.set(task.clientId, file);
    this.taskList.update((tasks) => [...tasks, task]);

    return task;
  }

  addFiles(files: readonly File[]): UploadTask[] {
    return files.map((file) => this.addFile(file));
  }

  getTask(clientId: string): UploadTask | undefined {
    return this.taskList().find((task) => task.clientId === clientId);
  }

  getFile(clientId: string): File | undefined {
    return this.fileRegistry.get(clientId);
  }

  removeTask(clientId: string): void {
    this.fileRegistry.delete(clientId);
    this.taskList.update((tasks) => tasks.filter((task) => task.clientId !== clientId));
  }

  clear(): void {
    this.fileRegistry.clear();
    this.taskList.set([]);
  }

  async executeDirectUpload(
    clientId: string,
    options: ExecuteDirectUploadOptions = {},
  ): Promise<UploadTask> {
    const task = this.requireTask(clientId);

    if (!this.useDirectCloudinaryUpload) {
      const errorMessage = 'Direct Cloudinary upload is currently disabled by rollout flag.';
      this.markFailed(clientId, errorMessage);
      throw new Error(errorMessage);
    }

    const sourceFile = this.requireSourceFile(clientId);
    const uploadParts = this.normalizeUploadParts(task, options);
    const totalFileSize = this.getUploadTotalBytes(uploadParts);
    const totalParts = uploadParts.length;

    this.beginPreflight(clientId);

    try {
      const preflightResult = await firstValueFrom(
        this.uploadsApi.uploadPreflight({
          fileSizeBytes: sourceFile.size,
          mimeType: sourceFile.type || task.mimeType,
        }),
      );

      const nextTask = this.storePreflightResult(clientId, preflightResult);
      if (!nextTask?.preflightResult?.canUpload) {
        return this.requireTask(clientId);
      }

      this.patchTask(clientId, {
        totalParts,
        uploadedParts: [],
      });

      const initResult = await firstValueFrom(
        this.directUploadApi.initDirectUpload({
          fileSizeBytes: totalFileSize,
          mimeType: options.processedFile?.type || uploadParts[0]?.file.type || task.mimeType,
          filename: task.filename,
        }),
      );

      this.storeDirectUploadSession(clientId, initResult);

      let lastPublicId = '';
      for (const part of uploadParts) {
        let uploadFields: {
          uploadUrl: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          folder: string;
          publicId: string;
        };

        if (part.partIndex === 0) {
          uploadFields = {
            uploadUrl: initResult.uploadUrl,
            apiKey: initResult.apiKey,
            timestamp: initResult.timestamp,
            signature: initResult.signature,
            folder: initResult.folder,
            publicId: initResult.publicId,
          };
        } else {
          const signResult = await firstValueFrom(
            this.directUploadApi.signPart({
              uploadId: initResult.uploadId,
              partIndex: part.partIndex,
            }),
          );
          uploadFields = {
            uploadUrl: signResult.uploadUrl,
            apiKey: signResult.apiKey,
            timestamp: signResult.timestamp,
            signature: signResult.signature,
            folder: signResult.folder,
            publicId: signResult.publicId,
          };
        }

        this.beginUploading(clientId, part.partIndex, totalParts);

        const response = await firstValueFrom(
          this.directUploadApi.uploadPartToCloudinary({
            ...uploadFields,
            file: part.file,
          }),
        );

        lastPublicId = response.public_id;
        this.trackUploadedPartFromResult(clientId, part.partIndex, response);
      }

      const completedTask = this.requireTask(clientId);
      const compressedTotalBytes =
        options.processedFile?.size ??
        completedTask.compressedTotalBytes ??
        completedTask.uploadedParts.reduce((sum, p) => sum + p.sizeBytes, 0);

      this.setCompressedTotalBytes(clientId, compressedTotalBytes);
      this.beginFinalizing(clientId);

      const completedMedia = await firstValueFrom(
        this.directUploadApi.completeDirectUpload({
          uploadId: initResult.uploadId,
          cloudinaryPublicId: lastPublicId,
          finalSizeBytes: compressedTotalBytes,
        }),
      );

      this.markCompleted(clientId, completedMedia as UploadTask['completedMedia']);
      return this.requireTask(clientId);
    } catch (error) {
      const errorMessage = this.getUploadFailureMessage(error);
      await this.abortOnUnrecoverableFailure(clientId, errorMessage);
      throw error;
    }
  }

  beginPreflight(clientId: string): void {
    const task = this.requireTask(clientId);
    this.patchTask(clientId, {
      state: this.buildState('preflight', {
        baseState: task.state,
        preflightStatus: 'running',
      }),
    });
  }

  storePreflightResult(clientId: string, result: UploadPreflightResponse): UploadTask | undefined {
    const task = this.getTask(clientId);
    if (!task) {
      return undefined;
    }

    const nextPhase: UploadTaskPhase = result.canUpload ? 'preflight' : 'failed';
    const nextTask = this.patchTask(clientId, {
      preflightResult: result,
      state: this.buildState(nextPhase, {
        baseState: task.state,
        errorMessage: result.canUpload ? undefined : result.reason,
        preflightStatus: 'completed',
        currentPartIndex: null,
      }),
    });

    return nextTask ?? undefined;
  }

  beginCompression(clientId: string): void {
    const task = this.requireTask(clientId);
    this.requireSuccessfulPreflight(task);
    this.patchTask(clientId, {
      state: this.buildState('compressing', {
        baseState: task.state,
        preflightStatus: 'completed',
      }),
    });
  }

  setCompressedTotalBytes(clientId: string, compressedTotalBytes: number): void {
    this.patchTask(clientId, { compressedTotalBytes });
  }

  beginSplitting(clientId: string, totalParts: number): void {
    const task = this.requireTask(clientId);
    this.requireSuccessfulPreflight(task);

    this.patchTask(clientId, {
      totalParts,
      uploadedParts: [],
      state: this.buildState('splitting', {
        baseState: task.state,
        preflightStatus: 'completed',
        totalParts,
        currentPartIndex: null,
      }),
    });
  }

  storeDirectUploadSession(
    clientId: string,
    initResult: DirectUploadInitResult,
  ): UploadTask | undefined {
    const task = this.requireTask(clientId);
    const preflight = this.requireSuccessfulPreflight(task);
    const session: DirectUploadSession = {
      uploadId: initResult.uploadId,
      cloudName: initResult.cloudName,
      apiKey: initResult.apiKey,
      signature: initResult.signature,
      timestamp: initResult.timestamp,
      folder: initResult.folder,
      uploadFolder: preflight.uploadFolder,
      publicIdPattern: `${initResult.uploadId}__part_{partIndex}`,
      maxChunkSizeBytes: DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
      targetAccountId: preflight.targetAccountId,
      targetAccountRole: preflight.targetAccountRole,
      targetSecondaryOrder: preflight.targetSecondaryOrder,
    };

    return this.patchTask(clientId, {
      directUploadSession: session,
      state: this.buildState(task.state.phase, {
        baseState: task.state,
        preflightStatus: 'completed',
        sessionStatus: 'initialized',
      }),
    });
  }

  beginUploading(clientId: string, currentPartIndex: number, totalParts: number): void {
    const task = this.requireTask(clientId);
    if (!task.directUploadSession) {
      throw new Error('Direct upload init must succeed before part uploads begin.');
    }

    this.patchTask(clientId, {
      state: this.buildState('uploading', {
        baseState: task.state,
        preflightStatus: 'completed',
        sessionStatus: 'initialized',
        currentPartIndex,
        totalParts,
      }),
    });
  }

  beginFinalizing(clientId: string): void {
    const task = this.requireTask(clientId);
    this.patchTask(clientId, {
      state: this.buildState('finalizing', {
        baseState: task.state,
        preflightStatus: 'completed',
        sessionStatus: task.directUploadSession ? 'initialized' : task.state.sessionStatus,
        currentPartIndex: null,
      }),
    });
  }

  markCompleted(clientId: string, completedMedia: UploadTask['completedMedia']): void {
    const task = this.requireTask(clientId);
    this.patchTask(clientId, {
      completedMedia,
      state: this.buildState('completed', {
        baseState: task.state,
        preflightStatus: 'completed',
        sessionStatus: task.directUploadSession ? 'initialized' : task.state.sessionStatus,
        currentPartIndex: null,
      }),
    });
  }

  markFailed(clientId: string, errorMessage: string): void {
    const task = this.getTask(clientId);
    this.patchTask(clientId, {
      state: this.buildState('failed', {
        baseState: task?.state,
        errorMessage,
        currentPartIndex: null,
      }),
    });
  }

  buildPartPublicId(taskOrClientId: UploadTask | string, partIndex: number): string {
    const task =
      typeof taskOrClientId === 'string' ? this.requireTask(taskOrClientId) : taskOrClientId;
    const pattern = task.directUploadSession?.publicIdPattern;
    if (!pattern) {
      throw new Error('Direct upload session must exist before building part public IDs.');
    }

    return pattern.replace('{partIndex}', String(partIndex));
  }

  trackUploadedPart(
    clientId: string,
    partIndex: number,
    response: DirectUploadCloudinaryResponse,
  ): UploadTask | undefined {
    const task = this.requireTask(clientId);
    const session = task.directUploadSession;
    if (!session) {
      throw new Error('Direct upload session must exist before tracking uploaded parts.');
    }

    const part: DirectUploadUploadedPartMetadata = {
      partIndex,
      publicId: response.public_id,
      sizeBytes: response.bytes,
      cloudName: session.cloudName,
      uploadId: session.uploadId,
      secureUrl: response.secure_url,
      resourceType: response.resource_type,
      etag: response.etag ?? null,
    };

    const uploadedParts = [...task.uploadedParts.filter((item) => item.partIndex !== partIndex), part]
      .sort((left, right) => left.partIndex - right.partIndex);

    return this.patchTask(clientId, { uploadedParts });
  }

  getEffectiveChunkSizeLimit(clientId: string): number {
    const sessionLimit = this.getTask(clientId)?.directUploadSession?.maxChunkSizeBytes;
    return Math.min(
      DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
      sessionLimit ?? DIRECT_UPLOAD_MAX_CHUNK_SIZE_BYTES,
    );
  }

  async abortOnUnrecoverableFailure(clientId: string, errorMessage: string): Promise<void> {
    const task = this.getTask(clientId);
    this.markFailed(clientId, errorMessage);

    if (!task?.directUploadSession) {
      return;
    }

    try {
      await firstValueFrom(
        this.directUploadApi.abortDirectUpload({
          uploadId: task.directUploadSession.uploadId,
        }),
      );
    } catch {
      // Best-effort cleanup; the caller still gets the original unrecoverable failure state.
    }
  }

  private requireSourceFile(clientId: string): File {
    const file = this.getFile(clientId);
    if (!file) {
      throw new Error(`Upload source file for task ${clientId} was not found.`);
    }

    return file;
  }

  private normalizeUploadParts(
    task: UploadTask,
    options: ExecuteDirectUploadOptions,
  ): UploadTaskPartInput[] {
    if (options.parts?.length) {
      const sortedParts = [...options.parts].sort((left, right) => left.partIndex - right.partIndex);
      const totalParts = sortedParts.length;

      sortedParts.forEach((part, index) => {
        if (part.partIndex !== index) {
          throw new Error('Direct upload parts must be sequential and zero-based.');
        }

        if (part.totalParts !== totalParts) {
          throw new Error('Direct upload parts must agree on the total part count.');
        }
      });

      return sortedParts.map((part) => ({
        file: part.file,
        partIndex: part.partIndex,
        totalParts,
        sizeBytes: part.sizeBytes,
      }));
    }

    const fallbackFile = options.processedFile ?? this.requireSourceFile(task.clientId);
    return [
      {
        file: fallbackFile,
        partIndex: 0,
        totalParts: 1,
        sizeBytes: fallbackFile.size,
      },
    ];
  }

  private getUploadTotalBytes(parts: readonly UploadTaskPartInput[]): number {
    return parts.reduce((sum, part) => sum + part.sizeBytes, 0);
  }

  private trackUploadedPartFromResult(
    clientId: string,
    partIndex: number,
    result: DirectUploadPartResult,
  ): UploadTask | undefined {
    const task = this.requireTask(clientId);
    const session = task.directUploadSession;
    if (!session) {
      throw new Error('Direct upload session must exist before tracking uploaded parts.');
    }

    const part: DirectUploadUploadedPartMetadata = {
      partIndex,
      publicId: result.public_id,
      sizeBytes: result.bytes,
      cloudName: session.cloudName,
      uploadId: session.uploadId,
      secureUrl: result.secure_url ?? '',
      resourceType: 'auto',
      etag: null,
    };

    const uploadedParts = [
      ...task.uploadedParts.filter((item) => item.partIndex !== partIndex),
      part,
    ].sort((left, right) => left.partIndex - right.partIndex);

    return this.patchTask(clientId, { uploadedParts });
  }

  private getUploadFailureMessage(error: unknown, fallback = 'Direct upload failed.'): string {
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }

  private requireTask(clientId: string): UploadTask {
    const task = this.getTask(clientId);
    if (!task) {
      throw new Error(`Upload task ${clientId} was not found.`);
    }

    return task;
  }

  private requireSuccessfulPreflight(
    task: UploadTask,
  ): DirectUploadPreflightSuccessResponse {
    if (!task.preflightResult?.canUpload) {
      throw new Error('Preflight must succeed before processing or direct upload init begins.');
    }

    return task.preflightResult;
  }

  private buildState(
    phase: UploadTaskPhase,
    options: {
      baseState?: UploadTaskState;
      errorMessage?: string;
      preflightStatus?: UploadTaskPreflightStatus;
      sessionStatus?: UploadTaskSessionStatus;
      currentPartIndex?: number | null;
      totalParts?: number | null;
    } = {},
  ): UploadTask['state'] {
    const now = new Date().toISOString();
    const baseState = options.baseState;

    return {
      phase,
      preflightStatus: options.preflightStatus ?? baseState?.preflightStatus ?? 'idle',
      sessionStatus: options.sessionStatus ?? baseState?.sessionStatus ?? 'idle',
      currentPartIndex:
        options.currentPartIndex !== undefined
          ? options.currentPartIndex
          : baseState?.currentPartIndex ?? null,
      totalParts: options.totalParts !== undefined ? options.totalParts : baseState?.totalParts ?? null,
      errorMessage: options.errorMessage,
      startedAt: now,
      updatedAt: now,
    };
  }

  private patchTask(
    clientId: string,
    patch: Partial<Omit<UploadTask, 'clientId' | 'createdAt' | 'mediaId'>>,
  ): UploadTask | undefined {
    let updatedTask: UploadTask | undefined;

    this.taskList.update((tasks) =>
      tasks.map((task) => {
        if (task.clientId !== clientId) {
          return task;
        }

        const nextUpdatedAt = new Date().toISOString();
        updatedTask = {
          ...task,
          ...patch,
          updatedAt: nextUpdatedAt,
          state: patch.state
            ? { ...task.state, ...patch.state, updatedAt: nextUpdatedAt }
            : { ...task.state, updatedAt: nextUpdatedAt },
        };
        return updatedTask;
      }),
    );

    return updatedTask;
  }
}