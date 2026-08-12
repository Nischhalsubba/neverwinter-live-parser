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
  private readonly targetSwitchWindowMs: number;
  private state: EncounterManagerState;

  constructor(inactivityTimeoutMs: number) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
    this.targetSwitchWindowMs = Math.max(3_000, Math.floor(inactivityTimeoutMs / 2));
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
    this.maybeRotateEncounter(event);

    if (!this.state.current) {
      this.state.current = createEncounter(this.createEncounterId(), event.timestamp);
    }

    applyEventToEncounter(this.state.current, event);
  }

  flush(now = Date.now()): boolean {
    return this.maybeExpire(now);
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

  getCurrentEncounterId(): string | null {
    return this.state.current?.id ?? null;
  }

  private maybeExpire(now: number): boolean {
    const current = this.state.current;
    if (!current) {
      return false;
    }

    const idleFor = now - current.lastActivityAt;
    if (idleFor < this.inactivityTimeoutMs) {
      return false;
    }

    this.state.completed = [
      finalizeEncounter(current, current.lastActivityAt + this.inactivityTimeoutMs),
      ...this.state.completed
    ].slice(0, 20);
    this.state.current = null;
    return true;
  }

  private maybeRotateEncounter(event: CombatEvent): void {
    const current = this.state.current;
    if (!current || event.eventType !== "damage") {
      return;
    }

    if (!current.labelHint || !event.targetName) {
      return;
    }

    const idleFor = event.timestamp - current.lastActivityAt;
    if (idleFor < this.targetSwitchWindowMs) {
      return;
    }

    if (current.labelHint === event.targetName) {
      return;
    }

    this.state.completed = [
      finalizeEncounter(current, current.lastActivityAt + this.targetSwitchWindowMs),
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
