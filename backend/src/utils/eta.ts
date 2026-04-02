export class EtaEstimator {
  private alpha: number; // EWMA smoothing
  private reanchorThreshold: number; // % difference required to re-anchor
  private minSampleSeconds: number; // ignore too-short dt

  private lastSampleTimeUtc: number;
  private lastSampleDoneUnits: number;
  private smoothedUnitsPerSecond: number;

  private etaAnchorValue: number | null; // in seconds
  private etaAnchorTimeUtc: number;

  constructor(alpha: number = 0.05, reanchorThreshold: number = 0.2, minSampleSeconds: number = 0.15) {
    this.alpha = alpha;
    this.reanchorThreshold = reanchorThreshold;
    this.minSampleSeconds = minSampleSeconds;
    this.lastSampleTimeUtc = Date.now();
    this.lastSampleDoneUnits = 0;
    this.smoothedUnitsPerSecond = 0;
    this.etaAnchorValue = null;
    this.etaAnchorTimeUtc = Date.now();
  }

  public reset() {
    this.lastSampleTimeUtc = Date.now();
    this.lastSampleDoneUnits = 0;
    this.smoothedUnitsPerSecond = 0;
    this.etaAnchorValue = null;
    this.etaAnchorTimeUtc = Date.now();
  }

  /**
   * Updates internal rate estimate and re-anchors ETA
   * @param totalUnits total work units (e.g., 100 for percent, or totalBytes for bytes)
   * @param doneUnits completed work units so far (e.g., percent, or bytes transferred)
   */
  public update(totalUnits: number, doneUnits: number) {
    const now = Date.now();
    if (totalUnits <= 0) return;

    doneUnits = Math.max(0, Math.min(totalUnits, doneUnits));
    const remainingUnits = Math.max(0, totalUnits - doneUnits);

    const dt = (now - this.lastSampleTimeUtc) / 1000;
    const dUnits = doneUnits - this.lastSampleDoneUnits;

    if (dt >= this.minSampleSeconds && dUnits > 0) {
      const instUnitsPerSecond = dUnits / dt;

      if (this.smoothedUnitsPerSecond <= 0) {
        this.smoothedUnitsPerSecond = instUnitsPerSecond;
      } else {
        this.smoothedUnitsPerSecond = this.alpha * instUnitsPerSecond + (1 - this.alpha) * this.smoothedUnitsPerSecond;
      }

      this.lastSampleTimeUtc = now;
      this.lastSampleDoneUnits = doneUnits;
    }

    if (this.smoothedUnitsPerSecond > 1e-6 && remainingUnits > 0) {
      const newEta = remainingUnits / this.smoothedUnitsPerSecond;

      if (this.etaAnchorValue === null) {
        this.etaAnchorValue = newEta;
        this.etaAnchorTimeUtc = now;
      } else {
        // What countdown would currently show
        const elapsedSinceAnchor = (now - this.etaAnchorTimeUtc) / 1000;
        const predictedNow = Math.max(0, this.etaAnchorValue - elapsedSinceAnchor || 0);

        const baseSeconds = Math.max(1, predictedNow);
        const diffRatio = Math.abs(newEta - predictedNow) / baseSeconds;

        if (diffRatio > this.reanchorThreshold) {
          this.etaAnchorValue = newEta;
          this.etaAnchorTimeUtc = now;
        }
      }
    }
  }

  /**
   * Returns current speed in units per second
   */
  public getSpeed(): number {
    return this.smoothedUnitsPerSecond;
  }

  /**
   * Returns a countdown ETA in seconds for UI display
   */
  public getDisplayEta(): number | null {
    if (this.etaAnchorValue === null) return null;

    const elapsedSinceAnchor = (Date.now() - this.etaAnchorTimeUtc) / 1000;
    const remaining = this.etaAnchorValue - elapsedSinceAnchor;
    
    return Math.max(0, Math.ceil(remaining));
  }
}
