import { uuidv4 } from "@firebase/util";
import { PDFOptions } from "puppeteer";
import { ParsedQs } from "qs";
import { extensionParameters } from "./utilities/extension_parameters";

export interface GetParameters {
  adjustHeightToFit?: "yes" | "no";
  chromiumPdfOptions?: PDFOptions;
  data?: ParsedQs;
  headful?: "true" | "false";
  outputFileName?: string;
  templatePath?: string;
  shouldWaitForIsReady?: "yes" | "no";
}

export interface FirestoreParameters {
  data: FirebaseFirestore.DocumentData;
  id: string;
}

export interface ParsedParameters {
  adjustHeightToFit: boolean;
  chromiumPdfOptions: PDFOptions;
  data: ParsedQs;
  headless: boolean;
  outputFileName: string;
  templateBucket: string;
  templatePrefix: string;
  templateId: string;
  shouldWaitForIsReady: boolean;
}

const BOOLEAN_PDF_OPTIONS = [
  "printBackground",
  "displayHeaderFooter",
  "landscape",
  "preferCSSPageSize",
  "omitBackground",
];

/**
 * Parses raw parameters and converts their data structure when needed.
 *
 * @return {ParsedParameters}
 */
export function parseParameters({
  rawParameters,
}: {
  rawParameters:
    | (GetParameters & {
        [key in Exclude<keyof FirestoreParameters, "data">]?: undefined;
      })
    | (FirestoreParameters & {
        [key in Exclude<keyof GetParameters, "data">]?: undefined;
      });
}): ParsedParameters {
  if (typeof rawParameters.data === "string") {
    throw new Error("'data' should be an object, not a string.");
  }

  if (rawParameters.data instanceof Array) {
    throw new Error("'data' should be an object, not an array.");
  }

  let parsedChromiumPdfOptions = {};

  try {
    parsedChromiumPdfOptions = JSON.parse(
      extensionParameters.CHROMIUM_PDF_OPTIONS ?? "{}"
    );
  } catch (exception) {
    throw new Error("'CHROMIUM_PDF_OPTIONS' is not a valid JSON document.");
  }

  if (
    rawParameters.templatePath != null &&
    typeof rawParameters.templatePath !== "string"
  ) {
    throw new Error("'templatePath' should be a string.");
  }

  const templatePath =
    rawParameters.templatePath ?? extensionParameters.TEMPLATE_PATH;

  const parts = templatePath.split("/");
  const templateBucket = parts[0];
  const templatePrefix = parts.slice(1, -2).join("/");
  const templateId = parts[parts.length - 1];

  const parameters = {
    adjustHeightToFit:
      (rawParameters.adjustHeightToFit?.toLowerCase() ??
        extensionParameters.ADJUST_HEIGHT_TO_FIT.toLowerCase()) === "yes",
    chromiumPdfOptions: Object.fromEntries(
      Object.entries(
        ({
          ...parsedChromiumPdfOptions,
          ...rawParameters.chromiumPdfOptions,
        } as PDFOptions) ?? {}
      ).map(([key, value]) => {
        if (BOOLEAN_PDF_OPTIONS.includes(key)) {
          return [key, value.toLowerCase() === "true"];
        }
        return [key, value];
      })
    ),
    data: rawParameters.data ?? {},
    headless:
      process.env.IS_LOCAL != "true" ||
      rawParameters.headful?.toLowerCase() !== "true",
    outputFileName:
      rawParameters.outputFileName ??
      (rawParameters.id != null
        ? `${rawParameters.id}.pdf`
        : `${uuidv4()}-${new Date().toISOString()}.pdf`),
    templateBucket,
    templatePrefix,
    templateId,
    shouldWaitForIsReady:
      (rawParameters.shouldWaitForIsReady?.toLowerCase() ??
        extensionParameters.SHOULD_WAIT_FOR_IS_READY.toLowerCase()) === "yes",
  };

  return parameters;
}
