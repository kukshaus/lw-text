/** File types the explorer accepts (routed to the correct project folder). */
export const EXPLORER_ACCEPT =
  ".lw,.json,.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.ico,.ttf,.otf,.woff,.woff2";

export const UPLOADABLE_FOLDER_IDS = new Set([
  "templates",
  "schemas",
  "fixtures",
  "blocks",
  "assets",
  "fonts",
]);

export type UploadFolderHint = "templates" | "schemas" | "fixtures" | "blocks" | "assets" | "fonts" | "auto";

export async function filesToUploadPayload(files: File[]): Promise<Array<{ filename: string; data: string }>> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<{ filename: string; data: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.includes(",") ? result.split(",")[1]! : result;
            resolve({ filename: file.name, data: base64 });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export function pickFiles(accept = EXPLORER_ACCEPT): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files ? [...input.files] : []);
    };
    input.click();
  });
}
