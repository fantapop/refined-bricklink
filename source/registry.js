/**
 * Feature Registry
 *
 * Each feature file pushes itself onto this array.
 * main.js iterates the registry to init enabled features.
 */
window.RefinedBricklink = window.RefinedBricklink || {};
window.RefinedBricklink.features = window.RefinedBricklink.features || [];
var RefinedBricklink = window.RefinedBricklink;

/**
 * Suffix that marks a wanted list as hidden. Configurable via rb-hide-pattern.
 * Set synchronously by wanted-list-hide on init so other features can rely on it.
 */
RefinedBricklink.hidePattern = " [x]";

/**
 * Returns true if the wanted list name is marked as hidden.
 */
RefinedBricklink.isHidden = function (name) {
  return (
    typeof name === "string" &&
    RefinedBricklink.hidePattern.length > 0 &&
    name.endsWith(RefinedBricklink.hidePattern)
  );
};
