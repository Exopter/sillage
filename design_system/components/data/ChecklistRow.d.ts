import * as React from 'react';

export type ChecklistState = 'done' | 'active' | 'pending' | 'blocked';

export interface ChecklistRowProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  /** @default 'pending' */
  state?: ChecklistState;
  /** Owner token, e.g. "PILOT", "ENG-2". */
  owner?: string;
  /** Blocker / fault note (renders red). */
  blocker?: string;
  /** Evidence link href (FDR, test result, doc). */
  evidence?: string;
  /** Evidence link label. @default 'Evidence' */
  evidenceLabel?: string;
}

/** Checklist item with completion state, owner, blocker, and evidence link. */
export function ChecklistRow(props: ChecklistRowProps): React.JSX.Element;
