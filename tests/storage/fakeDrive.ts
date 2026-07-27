import { Readable } from 'node:stream';
import { FOLDER_MIME_TYPE } from '../../src/services/storage/gdriveStorageProvider.js';

export interface FakeDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size?: string;
  createdTime?: string;
  content?: Buffer;
}

/**
 * A minimal in-memory stand-in for the subset of the Google Drive API
 * (`drive_v3.Drive`) that `GDriveStorageProvider` calls. Good enough to
 * exercise folder resolution, pagination, download, and move logic
 * without any real network access.
 */
export class FakeDrive {
  public readonly filesById = new Map<string, FakeDriveFile>();
  private nextId = 1;

  addFolder(name: string, parents: string[] = []): FakeDriveFile {
    const file: FakeDriveFile = { id: `folder-${this.nextId++}`, name, mimeType: FOLDER_MIME_TYPE, parents };
    this.filesById.set(file.id, file);
    return file;
  }

  addVideoFile(
    name: string,
    parents: string[],
    options: { createdTime?: string; content?: string } = {},
  ): FakeDriveFile {
    const file: FakeDriveFile = {
      id: `file-${this.nextId++}`,
      name,
      mimeType: 'video/mp4',
      parents,
      createdTime: options.createdTime ?? new Date().toISOString(),
      content: Buffer.from(options.content ?? 'fake video bytes'),
    };
    this.filesById.set(file.id, file);
    return file;
  }

  findFolderByName(name: string): FakeDriveFile | undefined {
    return [...this.filesById.values()].find((f) => f.mimeType === FOLDER_MIME_TYPE && f.name === name);
  }

  // --- Fake drive_v3.Drive surface -----------------------------------------

  files = {
    list: async (params: {
      q: string;
      pageToken?: string;
      pageSize?: number;
    }): Promise<{ data: { files: FakeDriveFile[]; nextPageToken?: string } }> => {
      const { q } = params;

      if (q.includes(`mimeType='${FOLDER_MIME_TYPE}'`)) {
        const nameMatch = /name='([^']+)'/.exec(q);
        const name = nameMatch?.[1];
        const found = name ? this.findFolderByName(name) : undefined;
        return { data: { files: found ? [found] : [] } };
      }

      const parentMatch = /'([^']+)' in parents/.exec(q);
      const folderId = parentMatch?.[1];
      const all = [...this.filesById.values()].filter((f) => folderId && f.parents.includes(folderId));

      const pageSize = params.pageSize ?? all.length;
      const startIndex = params.pageToken ? Number(params.pageToken) : 0;
      const page = all.slice(startIndex, startIndex + pageSize);
      const nextPageToken = startIndex + pageSize < all.length ? String(startIndex + pageSize) : undefined;

      return { data: { files: page, nextPageToken } };
    },

    create: async (params: {
      requestBody: { name: string; mimeType: string };
    }): Promise<{ data: { id: string } }> => {
      const folder = this.addFolder(params.requestBody.name);
      return { data: { id: folder.id } };
    },

    get: async (
      params: { fileId: string; alt?: string; fields?: string },
      options?: { responseType?: string },
    ): Promise<{ data: unknown }> => {
      const file = this.filesById.get(params.fileId);
      if (!file) {
        throw new Error(`FakeDrive: file not found: ${params.fileId}`);
      }

      if (params.alt === 'media' || options?.responseType === 'stream') {
        return { data: Readable.from(file.content ?? Buffer.alloc(0)) };
      }

      return { data: { parents: file.parents } };
    },

    update: async (params: {
      fileId: string;
      addParents?: string;
      removeParents?: string;
    }): Promise<{ data: { id: string; parents: string[] } }> => {
      const file = this.filesById.get(params.fileId);
      if (!file) {
        throw new Error(`FakeDrive: file not found: ${params.fileId}`);
      }

      const removeIds = (params.removeParents ?? '').split(',').filter(Boolean);
      file.parents = file.parents.filter((parentId) => !removeIds.includes(parentId));
      if (params.addParents) {
        file.parents.push(params.addParents);
      }

      return { data: { id: file.id, parents: file.parents } };
    },
  };
}
