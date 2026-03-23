import {
  applyEventToEncounter,
  createEncounter,
  finalizeEncounter
} from "../aggregation/encounterAggregator.js";
import type { CombatEvent, EncounterSnapshot } from "../../shared/types.js";

type EncounterManagerState = {
  current: ReturnType<typeof createEncounter> | null;
  completed: EncounterSnapshot[];
};

export class EncounterManager {
  private readonly inactivityTimeoutMs: number;
  private state: EncounterManagerState;

  constructor(inactivityTimeoutMs: number) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
    this.state = {
      current: null,
      completed: []
    };
  }

  consume(event: CombatEvent): void {
    if (!this.isRelevantEvent(event)) {
      return;
    }

    this.maybeExpire(event.timestamp);

    if (!this.state.current) {
      this.state.current = createEncounter(this.createEncounterId(), event.timestamp);
    }

    applyEventToEncounter(this.state.current, event);
  }

  flush(now = Date.now()): void {
    this.maybeExpire(now);
  }

  getCurrentSnapshot(now = Date.now()): EncounterSnapshot | null {
    if (!this.state.current) {
      return null;
    }

    return finalizeEncounter(this.state.current, now);
  }

  getCompleted(): EncounterSnapshot[] {
    return [...this.state.completed];
  }

  private maybeExpire(now: number): void {
    const current = this.state.current;
    if (!current) {
      return;
    }

    const idleFor = now - current.lastActivityAt;
    if (idleFor < this.inactivityTimeoutMs) {
      return;
    }

    this.state.completed = [
      finalizeEncounter(current, current.lastActivityAt + this.inactivityTimeoutMs),
      ...this.state.completed
    ].slice(0, 20);
    this.state.current = null;
  }

  private isRelevantEvent(event: CombatEvent): boolean {
    return (
      event.eventType === "damage" ||
      event.eventType === "heal" ||
      event.eventType === "damageTaken"
    );
  }

  private createEncounterId(): string {
    return `enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
