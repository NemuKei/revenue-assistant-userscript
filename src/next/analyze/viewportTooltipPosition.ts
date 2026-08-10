export type ViewportTooltipPositionOptions = {
    anchorClientX: number;
    preferredClientTop: number;
    offset?: number;
};

export function positionViewportTooltip(
    tooltip: HTMLElement,
    options: ViewportTooltipPositionOptions
): void {
    const offset = options.offset ?? 8;
    const viewport = tooltip.ownerDocument.defaultView;
    const viewportElement = tooltip.ownerDocument.documentElement;
    const viewportWidth = viewportElement.clientWidth || viewport?.innerWidth || 0;
    const viewportHeight = viewportElement.clientHeight || viewport?.innerHeight || 0;
    const availableWidth = Math.max(0, viewportWidth - offset * 2);
    tooltip.style.removeProperty("max-width");
    const declaredMaxWidth = Number.parseFloat(viewport?.getComputedStyle(tooltip).maxWidth ?? "");
    tooltip.style.maxWidth = `${Math.min(
        Number.isFinite(declaredMaxWidth) ? declaredMaxWidth : availableWidth,
        availableWidth
    )}px`;

    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    const originRect = tooltip.getBoundingClientRect();
    tooltip.style.left = "1px";
    tooltip.style.top = "1px";
    const unitRect = tooltip.getBoundingClientRect();

    const desiredViewportLeft = clampViewportStart(
        options.anchorClientX + offset,
        originRect.width,
        viewportWidth,
        offset
    );
    const desiredViewportTop = clampViewportStart(
        options.preferredClientTop,
        originRect.height,
        viewportHeight,
        offset
    );
    tooltip.style.left = `${resolveFixedCssCoordinate(
        desiredViewportLeft,
        originRect.left,
        unitRect.left - originRect.left
    )}px`;
    tooltip.style.top = `${resolveFixedCssCoordinate(
        desiredViewportTop,
        originRect.top,
        unitRect.top - originRect.top
    )}px`;
}

export function resolveFixedCssCoordinate(
    desiredViewportCoordinate: number,
    fixedOriginViewportCoordinate: number,
    viewportPixelsPerCssPixel: number
): number {
    const scale = Number.isFinite(viewportPixelsPerCssPixel)
        && Math.abs(viewportPixelsPerCssPixel) >= 0.001
        ? viewportPixelsPerCssPixel
        : 1;
    return (desiredViewportCoordinate - fixedOriginViewportCoordinate) / scale;
}

function clampViewportStart(
    desiredStart: number,
    elementSize: number,
    viewportSize: number,
    offset: number
): number {
    const maximumStart = Math.max(offset, viewportSize - offset - elementSize);
    return Math.max(offset, Math.min(desiredStart, maximumStart));
}
