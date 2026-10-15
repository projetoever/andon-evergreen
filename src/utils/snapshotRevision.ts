/** Discard polls that overlap a mutation, including failed mutations. */
export class SnapshotRevision {
  private revision = 0;
  private mutations = 0;
  capture() {
    return this.revision;
  }
  canApply(revision: number) {
    return this.mutations === 0 && revision === this.revision;
  }
  async mutate<T>(action: () => Promise<T>): Promise<T> {
    this.revision += 1;
    this.mutations += 1;
    try {
      return await action();
    } finally {
      this.mutations -= 1;
      this.revision += 1;
    }
  }
}
