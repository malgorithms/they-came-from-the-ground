### Quicker and easier than Github issues for now

Stuff

- debug view prettier
- code quality and technical debt:
  - move all hard-coded constants into existing tweakables.ts. What a mess.
  - clean up all the player and playerconfig iterations in game.ts
  - get rid of sprite-batch class; vestigal from XNA
- firefox:
  - controller lag
  - button mappings different from chrome & safari
  - fps sucks
  - warning when controller connected, if bugs not fixable
- controller work:
  - visual indicator of controllers connected or not
  - neither pad can control menu when paused with start buttons (pausing controller should control menu)
  - autopause on disconnect
  - test MS Edge
  - handle case where both controllers connected, then left player disconnects, then new 1-player game started. this should swap connected controller assignment to left player
- performance:
  - only one calculation of tLC and bRC per draw;
  - consider no clouds on slow framerate
  - check if not drawing off-screen clouds affects thigns
  - profile JS
- sound pitch not implemented yet (supposed to be different when growing/shrinking)
- start linting
- test on old iMac
- make work on iPad
- consider separate timer on re-drawing
- warning when on mobile device
- slam sprite flickers back to life at end
- give characters names
- are rotations clockwise? should switch to counter-clockwise?
- on two player game against white, both balls going in hole on the right
- better font choice
- unlock AI's by beating previous; display of which unlocked
- include full-screen launch
- better intro with them emerging from the ground, possibly launching debris
- switch drawing players to pure canvas actions? might make for more creative additions/eyes/etc.
- breathe in/out sounds when growing/shrinking

Before launching

- better landing page
- discord to discuss
- proper readme page for github
- review all console logging
- basic SEO of landing page
- basic pageview stats?