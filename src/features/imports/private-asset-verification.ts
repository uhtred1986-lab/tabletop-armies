export type PrivateAssetReference = { blobKey: string };

export type PrivateAssetVerificationDependencies<Tx> = {
  lock: (tx: Tx, blobKey: string) => Promise<void>;
  head: (blobKey: string) => Promise<unknown>;
  concurrency?: number;
};

/**
 * Hold the shared deletion lock for every key before checking metadata. This
 * keeps collection cleanup from deleting a Blob between verification and the
 * pack_assets insert. Blob HEAD requests run with a fixed concurrency limit to
 * keep a large reviewed pack from holding its database transaction for minutes.
 */
export async function lockAndVerifyPrivateAssets<Tx>(
  tx: Tx,
  assets: readonly PrivateAssetReference[],
  dependencies: PrivateAssetVerificationDependencies<Tx>,
): Promise<void> {
  const keys = [...new Set(assets.map(({ blobKey }) => blobKey))].sort();
  for (const key of keys) await dependencies.lock(tx, key);

  const concurrency = Math.max(1, Math.min(32, Math.floor(dependencies.concurrency ?? 16)));
  let nextIndex = 0;
  let missing = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= keys.length) return;
      try {
        await dependencies.head(keys[index]!);
      } catch {
        missing = true;
      }
    }
  }));
  if (missing) throw new Error("asset-missing-private-blob");
}
