# Changelog

## [Unreleased]

### Added

- 1.1.0 brings the Counter board, a dashboard of one counter as the headline,
  its progress toward the goal, and the rest of its group charted alongside.
  Each tile is a query over Counters' own counters, run as whoever views it.
  Built on initiative-plugin-sdk 11.2, and needs plug-in API 11.2.
- Counters as a tool plug-in: counter groups and their counters, with the
  count, min, max, step, initial value, color and view mode the built-in tool
  holds, its min at most its max and its step above 0, Reset and Reset All, a
  counter blocking what it is linked to until it reaches its max, and the
  built-in tool's pages as layouts: grids and tables, cards in the counters'
  colours, each count in its own view mode, and sorts by name and count. Named in
  English, German, Spanish and French. Built on initiative-plugin-sdk 11.1.0,
  and needs plug-in API 11.1 (Initiative 0.80.0).
- Its registry listing, with three pictures: a tab of counter groups, a
  group's counters in each look, and a counter full screen.
