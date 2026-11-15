// Categorical series colors, dark steps, validated against the #121514 surface with the
// dataviz validator (lightness, chroma, CVD ΔE >= 8 adjacent, normal-vision, contrast).
// Fixed order, never cycled: a series keeps its slot whatever else is shown.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const;

export const AXIS = { tick: '#8a948f', grid: '#232826', font: 11 };
