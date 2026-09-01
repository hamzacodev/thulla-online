"use client";

import { supabase } from "./supabaseClient";

/**
 * Profile pictures, so a table of eight names reads as a table of eight
 * faces. Everything happens in the browser: the picture is centre-cropped
 * and re-encoded here, then uploaded straight to Supabase Storage into a
 * folder named after the uploader — the only folder their key is allowed
 * to write to.
 *
 * Re-encoding client-side is the whole trick. A phone camera original is
 * several megabytes of something we'd draw at 32 pixels; a 256px JPEG is a
 * few kilobytes, loads instantly on a patchy connection, and strips the
 * EXIF (including any GPS tag) as a side effect of being redrawn.
 */

const BUCKET = "avatars";
/** Square, and small — an avatar is only ever drawn at 24–72px. */
const SIZE = 256;
const QUALITY = 0.85;
/** A sanity limit on the *picked* file; what we upload is far smaller. */
export const MAX_PICK_BYTES = 12 * 1024 * 1024;

function avatarPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* some formats only decode through an <img>; try that next */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("undecodable"));
      img.src = url;
    });
  } finally {
    // Safe once the image has loaded — the decoded bitmap outlives the URL.
    URL.revokeObjectURL(url);
  }
}

/** Centre-crops to a square and re-encodes at 256px. */
export async function squareJpeg(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG.");
  }

  const side = Math.min(source.width, source.height);
  if (!side) throw new Error("Couldn't read that image. Try a JPEG or PNG.");

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image on this device.");

  ctx.drawImage(
    source,
    (source.width - side) / 2,
    (source.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE
  );
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("Couldn't process that image on this device.");
  return blob;
}

function storageProblem(message: string): string {
  if (/bucket not found/i.test(message)) {
    return "Photos aren't set up yet — run supabase-schema.sql in your Supabase project.";
  }
  if (/row-level security|not authorized|violates/i.test(message)) {
    return "Not allowed to save that. Try signing out and back in.";
  }
  return "Couldn't upload that picture. Try again.";
}

/** Uploads a new profile picture and returns the URL now on the profile. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > MAX_PICK_BYTES) throw new Error("That image is too big. Pick one under 12MB.");

  const blob = await squareJpeg(file);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(avatarPath(userId), blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) throw new Error(storageProblem(uploadError.message));

  // The path never changes, so the URL has to carry a version — otherwise
  // every browser that has seen the old picture keeps showing it.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(avatarPath(userId));
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error: saveError } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", userId);
  if (saveError) throw new Error("Uploaded, but couldn't save it to your profile. Try again.");

  return url;
}

export async function removeAvatar(userId: string): Promise<void> {
  // Clear the profile first: a dangling file nobody points at is harmless,
  // a profile pointing at a deleted file shows a broken face.
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) throw new Error("Couldn't remove your picture. Try again.");
  await supabase.storage.from(BUCKET).remove([avatarPath(userId)]);
}
