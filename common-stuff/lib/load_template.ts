A. Commit message:
Fix Regular Expression Denial of Service (ReDoS) by using hardcoded regex pattern.

B. Change summary:
Replaced the dynamic creation of the regular expression using `RegExp` constructor with a predefined, hardcoded regular expression pattern to avoid ReDoS vulnerabilities caused by user-supplied patterns.

C. Compatibility Risk:
Low

D. Fixed Code:
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import jszip from "jszip";
import Handlebars from "handlebars";
import * as functions from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { ApiError } from "@google-cloud/storage";
import "./utilities/setup_handlebars";
import { TemplateParameters } from "./utilities/parameters";

Handlebars.registerHelper("json", function (object) {
  const result = JSON.stringify(object);
  return new Handlebars.SafeString(result);
});

/**
 * Loads template zip file from Firebase Storage bucket, unzips it in a
 * temporary directory and returns the path of the temporary directory.
 */
export async function loadTemplate({
  data,
  templateBucket: templateBucketName,
  templatePrefix,
  templateId,
}: {
  data: TemplateParameters | undefined;
  templateBucket: string;
  templatePrefix: string;
  templateId: string;
}): Promise<string> {
  const templateBucket = getStorage().bucket(templateBucketName);

  let templateBuffer;
  try {
    [templateBuffer] = await templateBucket
      .file(`${templatePrefix}${templateId}`)
      .download();
  } catch (exception) {
    if (exception instanceof ApiError && exception.code === 404) {
      try {
        [templateBuffer] = await templateBucket
          .file(`${templatePrefix}${templateId}.zip`)
          .download();
      } catch {
        throw exception;
      }
    } else {
      throw exception;
    }
  }
  const temporaryDirectoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "pdfplum-"),
  );

  const zipFile = await jszip.loadAsync(templateBuffer);
  let rootDirectory: string | undefined;
  const compressedFiles = Object.entries(zipFile.files).filter(
    ([filename]) => !filename.includes("__MACOSX/"),
  );
  if (zipFile.files["index.html"] == null) {
    const rootDirectoryCandidates = [
      ...new Set(
        compressedFiles.map(([filename]) => filename.replace(/\/.*$/, "")),
      ),
    ];
    if (rootDirectoryCandidates.length === 1) {
      rootDirectory = rootDirectoryCandidates[0];
    } else {
      throw new Error(
        "There must be an 'index.html' file inside the zip file in its root folder.",
      );
    }
  }
  const promises = compressedFiles.map(
    async ([relativePath, file]: [string, jszip.JSZipObject]) => {
      let content: string | Buffer;
      // Use a predefined regex pattern to remove the rootDirectory
      const staticRootDirectoryPattern = new RegExp(`^${escapeRegExp(rootDirectory || '')}`, 'g');

      if (rootDirectory != null) {
        relativePath = relativePath.replace(staticRootDirectoryPattern, "");
      }
      if (relativePath === "" || relativePath.endsWith("/")) {
        return;
      }
      if (/\.(txt|md|html)$/.test(relativePath)) {
        functions.logger.info("Processing file with handlebars", {
          relativePath,
        });
        content = Handlebars.compile(await file.async("text"))(data);
      } else {
        functions.logger.info("Copying file as is", {
          relativePath,
        });
        content = await file.async("nodebuffer");
      }
      const filePath = path.join(temporaryDirectoryPath, relativePath);
      const directoryPath = path.dirname(filePath);
      fs.mkdirSync(directoryPath, { recursive: true });
      fs.writeFileSync(filePath, content);
    },
  );

  await Promise.all(promises);

  return temporaryDirectoryPath;
}

function escapeRegExp(string: string): string {
  // Escape special characters for use in the regex
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}