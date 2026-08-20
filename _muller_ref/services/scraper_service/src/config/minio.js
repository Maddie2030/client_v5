import { Client as MinioClient } from "minio";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "minio";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000", 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";
const MINIO_USE_SSL = (process.env.MINIO_USE_SSL || "false").toLowerCase() === "true";

export const DEFAULT_BUCKET = process.env.MINIO_BUCKET || "manga-pages";

export const minioClient = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export async function ensureBucket(bucket = DEFAULT_BUCKET) {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
    await minioClient.setBucketPolicy(
      bucket,
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    );
    console.log(`[MinIO] Created bucket "${bucket}" with public read policy`);
  }
}

/**
 * Build the MinIO object key for a chapter page.
 * Format: <parentSlug>-chapter-<chapterNumber>-webp<NNN>.webp
 * e.g. "hero-chapter-1-webp001.webp"
 */
export function buildPageObjectKey(parentSlug, chapterNumber, pageNumber) {
  const chStr = String(chapterNumber).replace(/[^0-9.]/g, "");
  const pageStr = String(pageNumber).padStart(3, "0");
  return `${parentSlug}-chapter-${chStr}-webp${pageStr}.webp`;
}

/**
 * Build the MinIO object key for a series cover image.
 * Format: <parentSlug>-cover.webp
 */
export function buildCoverObjectKey(parentSlug) {
  return `${parentSlug}-cover.webp`;
}
