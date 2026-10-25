import { Component, computed, input } from '@angular/core';
import { WorkoutType } from '../db';
import { TYPE_COLOR, TYPE_INK } from '../lifts';

@Component({
  selector: 'app-type-badge',
  template: `<span
    class="display inline-block rounded-md px-1.5 pt-[3px] pb-[2px] text-[13px] tracking-wide"
    [style.background]="color() + '24'"
    [style.color]="ink()"
    >{{ type() }}</span
  >`,
})
export class TypeBadge {
  readonly type = input.required<WorkoutType>();
  protected readonly color = computed(() => TYPE_COLOR[this.type()]);
  protected readonly ink = computed(() => TYPE_INK[this.type()]);
}
