export const RANK_RECOMMENDATION_WORKSPACE_STYLES = `
    [data-ra-rank-recommendation-workspace-layout] {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(300px, 356px);
        gap: 14px;
        align-items: start;
    }

    [data-ra-rank-recommendation-workspace-layout] > * {
        min-width: 0;
        grid-column: 1 / -1;
    }

    [data-ra-rank-recommendation-workspace-layout] > [data-ra-rank-recommendation-calendar] {
        grid-column: 1;
    }

    [data-ra-rank-recommendation-workspace-layout] > [data-ra-rank-recommendation-list] {
        grid-column: 2;
        align-self: stretch;
    }

    [data-ra-rank-recommendation-workspace-layout] > [data-ra-rank-recommendation-detail],
    [data-ra-rank-recommendation-workspace-layout] > [data-ra-sales-setting-warm-cache-month-controls],
    [data-ra-rank-recommendation-workspace-layout] > [data-ra-sales-setting-warm-cache-inline-status] {
        grid-column: 1 / -1;
    }

    [data-ra-rank-recommendation-calendar-state] {
        position: relative;
        box-shadow: inset 0 -3px 0 var(--ra-calendar-candidate-color, #4d79a8);
    }

    [data-ra-rank-recommendation-calendar-state="needs_evidence"] {
        --ra-calendar-candidate-color: #c18a2b;
    }

    [data-ra-rank-recommendation-calendar-state="recent_or_held"] {
        --ra-calendar-candidate-color: #7a8797;
    }

    [data-ra-rank-recommendation-calendar-cue] {
        position: absolute !important;
        right: 3px !important;
        bottom: 4px !important;
        z-index: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        min-width: 20px !important;
        height: 14px !important;
        padding: 0 3px !important;
        border: 1px solid var(--ra-calendar-candidate-color, #4d79a8) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.94) !important;
        color: var(--ra-calendar-candidate-color, #4d79a8) !important;
        font-size: 9px !important;
        font-weight: 700 !important;
        line-height: 1 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
    }

    [data-ra-rank-recommendation-list] {
        --ra-ui-bg: #f4f7fb;
        --ra-ui-surface: #ffffff;
        --ra-ui-surface-muted: #eef3f8;
        --ra-ui-border: #d6dee8;
        --ra-ui-border-strong: #aebdce;
        --ra-ui-text: #263444;
        --ra-ui-muted: #647386;
        --ra-ui-accent: #2864a2;
        --ra-ui-focus: #1f6fc2;
        --ra-ui-ready: #24714a;
        --ra-ui-evidence: #986a18;
        --ra-ui-held: #5f6c7a;
        margin: 0;
        padding: 0;
        border: 1px solid var(--ra-ui-border);
        border-radius: 10px;
        overflow: hidden;
        background: var(--ra-ui-surface);
        box-shadow: 0 8px 22px rgba(34, 54, 78, 0.09);
        color: var(--ra-ui-text);
        font-family: inherit;
    }

    [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-react-island-host] {
        min-height: 100%;
    }

    [data-ra-rank-recommendation-ui-component="workspace-rail"] {
        display: flex;
        min-height: 100%;
        flex-direction: column;
    }

    [data-ra-rank-recommendation-ui-component="rail-header"] {
        display: grid;
        gap: 4px;
        padding: 14px 14px 11px;
        border-bottom: 1px solid var(--ra-ui-border);
        background: linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%);
    }

    [data-ra-rank-recommendation-ui-component="rail-header"] h2 {
        margin: 0;
        color: var(--ra-ui-text);
        font-size: 17px;
        font-weight: 800;
        line-height: 1.3;
    }

    [data-ra-rank-recommendation-meta] {
        margin: 0;
        color: var(--ra-ui-muted);
        font-size: 11px;
        font-weight: 700;
        line-height: 1.45;
    }

    [data-ra-rank-recommendation-ui-component="rail-controls"] {
        display: grid;
        gap: 10px;
        padding: 11px 14px;
        border-bottom: 1px solid var(--ra-ui-border);
        background: #fbfcfe;
    }

    [data-ra-rank-recommendation-target-month-control] {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        color: var(--ra-ui-muted);
        font-size: 11px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-target-month] {
        width: 100%;
        min-height: 34px;
        padding: 5px 9px;
        border: 1px solid var(--ra-ui-border-strong);
        border-radius: 7px;
        background: #ffffff;
        color: var(--ra-ui-text);
        font: inherit;
        font-weight: 700;
    }

    [data-ra-rank-recommendation-view-mode-control] {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 5px;
    }

    [data-ra-rank-recommendation-view-mode-control] button {
        display: grid;
        gap: 1px;
        min-height: 46px;
        padding: 6px 5px;
        border: 1px solid var(--ra-ui-border);
        border-radius: 7px;
        background: #ffffff;
        color: var(--ra-ui-muted);
        cursor: pointer;
        font: inherit;
        text-align: center;
    }

    [data-ra-rank-recommendation-view-mode-control] button strong {
        font-size: 14px;
        font-weight: 850;
        line-height: 1.15;
    }

    [data-ra-rank-recommendation-view-mode-control] button span {
        font-size: 10px;
        font-weight: 800;
        line-height: 1.2;
    }

    [data-ra-rank-recommendation-view-mode-control] button[aria-pressed="true"] {
        border-color: #5f8fbe;
        background: #eaf3fc;
        color: #1d568c;
        box-shadow: inset 0 0 0 1px rgba(52, 113, 174, 0.16);
    }

    [data-ra-rank-recommendation-view-mode-control] button[disabled] {
        cursor: not-allowed;
        opacity: 0.5;
    }

    [data-ra-rank-recommendation-ui-component="task-list"] {
        display: grid;
        gap: 0;
        max-height: 620px;
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    [data-ra-rank-recommendation-date-group] {
        margin: 0;
        padding: 8px 14px 5px;
        background: #f4f7fa;
        color: #526277;
        font-size: 11px;
        font-weight: 850;
        line-height: 1.3;
    }

    [data-ra-rank-recommendation-task] {
        position: relative;
        display: grid;
        width: 100%;
        gap: 5px;
        padding: 11px 14px 11px 17px;
        border: 0;
        border-bottom: 1px solid #e4e9ef;
        background: #ffffff;
        color: var(--ra-ui-text);
        cursor: pointer;
        font: inherit;
        text-align: left;
    }

    [data-ra-rank-recommendation-task]::before {
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: #5f87b2;
        content: "";
    }

    [data-ra-rank-recommendation-task][data-work-state="needs_evidence"]::before {
        background: #c18a2b;
    }

    [data-ra-rank-recommendation-task][data-work-state="recent_or_held"]::before {
        background: #8793a0;
    }

    [data-ra-rank-recommendation-task]:hover,
    [data-ra-rank-recommendation-task][aria-pressed="true"] {
        background: #eef5fc;
    }

    [data-ra-rank-recommendation-task][aria-pressed="true"] {
        box-shadow: inset 0 0 0 1px #87afd4;
    }

    [data-ra-rank-recommendation-task-line="primary"],
    [data-ra-rank-recommendation-task-line="secondary"] {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    [data-ra-rank-recommendation-task-room] {
        min-width: 0;
        overflow: hidden;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    [data-ra-rank-recommendation-action-badge] {
        flex: 0 0 auto;
        padding: 2px 7px;
        border-radius: 999px;
        background: #eaf5ef;
        color: #246544;
        font-size: 10px;
        font-weight: 850;
        line-height: 1.5;
    }

    [data-ra-rank-recommendation-action-badge="lower_watch"] {
        background: #fff0f0;
        color: #9b3c3c;
    }

    [data-ra-rank-recommendation-action-badge="watch"],
    [data-ra-rank-recommendation-action-badge="not_eligible"] {
        background: #eef1f4;
        color: #586776;
    }

    [data-ra-rank-recommendation-task-rank] {
        color: #31465c;
        font-size: 12px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-task-status] {
        min-width: 0;
        overflow: hidden;
        color: var(--ra-ui-muted);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    [data-ra-rank-recommendation-empty] {
        margin: 0;
        padding: 28px 18px;
        color: var(--ra-ui-muted);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.6;
        text-align: center;
    }

    [data-ra-rank-recommendation-ui-component="rail-footer"] {
        display: grid;
        gap: 8px;
        margin-top: auto;
        padding: 10px 14px 12px;
        border-top: 1px solid var(--ra-ui-border);
        background: #fbfcfe;
    }

    [data-ra-rank-recommendation-display-limit-control] {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    [data-ra-rank-recommendation-order-control] details {
        color: var(--ra-ui-muted);
        font-size: 11px;
        font-weight: 750;
    }

    [data-ra-rank-recommendation-order-control] summary {
        cursor: pointer;
    }

    [data-ra-rank-recommendation-order-editor] {
        display: grid;
        gap: 7px;
        margin-top: 8px;
    }

    [data-ra-rank-recommendation-order-input] {
        width: 100%;
        min-height: 52px;
        padding: 7px 8px;
        border: 1px solid var(--ra-ui-border);
        border-radius: 7px;
        box-sizing: border-box;
        color: var(--ra-ui-text);
        font: inherit;
        resize: vertical;
    }

    [data-ra-rank-recommendation-detail] {
        margin: 0;
        min-width: 0;
    }

    [data-ra-rank-recommendation-ui-component="detail"] {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(230px, 280px);
        gap: 14px;
        align-items: start;
        padding: 18px;
        border: 1px solid #d4dde7;
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 8px 22px rgba(34, 54, 78, 0.08);
        color: #263444;
    }

    [data-ra-rank-recommendation-detail-header] {
        display: flex;
        grid-column: 1 / -1;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
    }

    [data-ra-rank-recommendation-detail-heading] {
        display: grid;
        gap: 3px;
        min-width: 0;
    }

    [data-ra-rank-recommendation-detail-heading] h2 {
        margin: 0;
        color: #213246;
        font-size: 18px;
        font-weight: 850;
        line-height: 1.35;
    }

    [data-ra-rank-recommendation-detail-heading] p {
        margin: 0;
        color: #647386;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.45;
    }

    [data-ra-rank-recommendation-detail-grid] {
        display: grid;
        grid-column: 1;
        grid-row: 2 / span 4;
        grid-template-columns: minmax(220px, 0.72fr) minmax(0, 1.28fr);
        gap: 14px;
        align-items: stretch;
    }

    [data-ra-rank-recommendation-rank-card],
    [data-ra-rank-recommendation-evidence-card],
    [data-ra-rank-recommendation-reason-card] {
        min-width: 0;
        padding: 14px;
        border: 1px solid #dfe5ec;
        border-radius: 9px;
        background: #f9fbfd;
    }

    [data-ra-rank-recommendation-rank-card] {
        display: grid;
        gap: 12px;
    }

    [data-ra-rank-recommendation-rank-pair] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    [data-ra-rank-recommendation-rank-value] {
        display: grid;
        gap: 3px;
        padding: 11px;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: inset 0 0 0 1px #dfe5ec;
    }

    [data-ra-rank-recommendation-rank-value] span {
        color: #6a7888;
        font-size: 10px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-rank-value] strong {
        color: #24364a;
        font-size: 22px;
        font-weight: 850;
        line-height: 1.15;
    }

    [data-ra-rank-recommendation-rank-value="candidate"] {
        background: #eaf4ee;
        box-shadow: inset 0 0 0 1px #b9d6c4;
    }

    [data-ra-rank-recommendation-rank-value="candidate"] strong {
        color: #20613f;
    }

    [data-ra-rank-recommendation-metrics] {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    [data-ra-rank-recommendation-metric] {
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 10px;
        border: 1px solid #dfe5ec;
        border-radius: 8px;
        background: #ffffff;
    }

    [data-ra-rank-recommendation-metric] span {
        color: #667586;
        font-size: 10px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-metric] strong {
        overflow-wrap: anywhere;
        color: #26394e;
        font-size: 14px;
        font-weight: 850;
        line-height: 1.25;
    }

    [data-ra-rank-recommendation-reason-card] {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 14px;
    }

    [data-ra-rank-recommendation-reason-card] h3,
    [data-ra-rank-recommendation-evidence-card] h3,
    [data-ra-rank-recommendation-review] h3 {
        margin: 0 0 5px;
        color: #2a3b4e;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.35;
    }

    [data-ra-rank-recommendation-reason-card] p,
    [data-ra-rank-recommendation-evidence-card] p {
        margin: 0;
        color: #58697b;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.55;
        overflow-wrap: anywhere;
    }

    [data-ra-rank-recommendation-evidence-card] {
        display: grid;
        gap: 8px;
        overflow: hidden;
    }

    [data-ra-rank-recommendation-evidence-host] {
        min-height: 196px;
        min-width: 0;
        overflow: hidden;
    }

    [data-ra-rank-recommendation-evidence-host] [data-ra-sales-setting-booking-curve-section] {
        margin: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
    }

    [data-ra-rank-recommendation-evidence-host] [data-ra-sales-setting-booking-curve-grid] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    [data-ra-rank-recommendation-actions] {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
        padding-top: 2px;
    }

    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-actions],
    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-pending-decision],
    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-rank-change-status],
    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-review] {
        grid-column: 2;
    }

    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-actions] {
        align-items: stretch;
        flex-direction: column;
    }

    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-actions] > * {
        width: 100%;
        box-sizing: border-box;
    }

    [data-ra-rank-recommendation-button] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 7px 12px;
        border: 1px solid #acbbcb;
        border-radius: 7px;
        background: #ffffff;
        color: #2c4157;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.25;
        text-decoration: none;
    }

    [data-ra-rank-recommendation-button-action="review-open"],
    [data-ra-rank-recommendation-button-action="rank-change-submit"] {
        min-height: 40px;
        border-color: #286aa9;
        background: #286aa9;
        color: #ffffff;
    }

    [data-ra-rank-recommendation-button]:hover:not([disabled]) {
        border-color: #7798b9;
        background: #f1f6fb;
    }

    [data-ra-rank-recommendation-button-action="review-open"]:hover:not([disabled]),
    [data-ra-rank-recommendation-button-action="rank-change-submit"]:hover:not([disabled]) {
        border-color: #20578d;
        background: #20578d;
        color: #ffffff;
    }

    [data-ra-rank-recommendation-button]:focus-visible,
    [data-ra-rank-recommendation-task]:focus-visible,
    [data-ra-rank-recommendation-view-mode-control] button:focus-visible,
    [data-ra-rank-recommendation-target-month]:focus-visible {
        outline: 3px solid rgba(31, 111, 194, 0.35);
        outline-offset: 2px;
    }

    [data-ra-rank-recommendation-button][disabled] {
        cursor: not-allowed;
        opacity: 0.58;
    }

    [data-ra-rank-recommendation-review] {
        display: grid;
        gap: 11px;
        padding: 14px;
        border: 1px solid #9db8d4;
        border-radius: 9px;
        background: #f2f7fc;
    }

    [data-ra-rank-recommendation-review-summary] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-review]
    [data-ra-rank-recommendation-review-summary] {
        grid-template-columns: minmax(0, 1fr);
    }

    [data-ra-rank-recommendation-review-summary] div {
        display: grid;
        gap: 2px;
        padding: 9px 10px;
        border-radius: 7px;
        background: #ffffff;
    }

    [data-ra-rank-recommendation-review-summary] span {
        color: #687789;
        font-size: 10px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-review-summary] strong {
        color: #26394e;
        font-size: 14px;
        font-weight: 850;
    }

    [data-ra-rank-recommendation-review] label {
        display: grid;
        grid-template-columns: auto minmax(0, 180px);
        gap: 8px;
        align-items: center;
        color: #526477;
        font-size: 11px;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-review] select {
        min-height: 34px;
        padding: 5px 8px;
        border: 1px solid #aebdce;
        border-radius: 7px;
        background: #ffffff;
        color: #26394e;
        font: inherit;
        font-weight: 800;
    }

    [data-ra-rank-recommendation-review-note] {
        margin: 0;
        color: #54687c;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.55;
    }

    [data-ra-rank-recommendation-rank-change-status] {
        padding: 8px 10px;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.45;
    }

    [data-ra-rank-recommendation-rank-change-status="success"] {
        border: 1px solid #acd0b7;
        background: #edf8f0;
        color: #276743;
    }

    [data-ra-rank-recommendation-rank-change-status="confirming"] {
        border: 1px solid #b5c8e1;
        background: #eef5fd;
        color: #315f91;
    }

    [data-ra-rank-recommendation-rank-change-status="blocked"],
    [data-ra-rank-recommendation-rank-change-status="failed"] {
        border: 1px solid #e1b5b5;
        background: #fff1f1;
        color: #8a3d3d;
    }

    [data-ra-rank-recommendation-pending-decision] {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        padding: 8px 10px;
        border: 1px solid #dac183;
        border-radius: 7px;
        background: #fff9e8;
        color: #6d5418;
        font-size: 11px;
        font-weight: 800;
    }

    @media (max-width: 1180px) {
        [data-ra-rank-recommendation-workspace-layout] {
            grid-template-columns: minmax(0, 1fr);
        }

        [data-ra-rank-recommendation-workspace-layout] > [data-ra-rank-recommendation-calendar],
        [data-ra-rank-recommendation-workspace-layout] > [data-ra-rank-recommendation-list] {
            grid-column: 1;
        }

        [data-ra-rank-recommendation-ui-component="task-list"] {
            max-height: 440px;
        }
    }

    @media (max-width: 760px) {
        [data-ra-rank-recommendation-ui-component="detail"] {
            grid-template-columns: minmax(0, 1fr);
        }

        [data-ra-rank-recommendation-detail-header],
        [data-ra-rank-recommendation-detail-grid],
        [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-actions],
        [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-pending-decision],
        [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-rank-change-status],
        [data-ra-rank-recommendation-ui-component="detail"] > [data-ra-rank-recommendation-review] {
            grid-column: 1;
            grid-row: auto;
        }

        [data-ra-rank-recommendation-detail-grid],
        [data-ra-rank-recommendation-reason-card] {
            grid-template-columns: minmax(0, 1fr);
        }

        [data-ra-rank-recommendation-reason-card] {
            grid-column: 1;
        }

        [data-ra-rank-recommendation-ui-component="detail"] {
            padding: 13px;
        }

        [data-ra-rank-recommendation-detail-header] {
            align-items: stretch;
            flex-direction: column;
        }

        [data-ra-rank-recommendation-metrics] {
            grid-template-columns: minmax(0, 1fr);
        }

        [data-ra-rank-recommendation-evidence-host] [data-ra-sales-setting-booking-curve-grid] {
            grid-template-columns: minmax(0, 1fr);
        }

        [data-ra-rank-recommendation-actions] {
            align-items: stretch;
            flex-direction: column;
        }

        [data-ra-rank-recommendation-actions] > * {
            width: 100%;
            box-sizing: border-box;
        }
    }
`;
