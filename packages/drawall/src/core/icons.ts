export const iconUrl = (name: string): URL => {
  const path = window.location.pathname.startsWith('/')
    ? window.location.pathname.substring(1)
    : window.location.pathname;
  const subpath = path.length > 0 ? `${path}/icons/${name}` : `icons/${name}`;
  return new URL(`${window.location.protocol}//${window.location.host}/${subpath}`);
};

export const Icons = {
  //snapGuidesOff: iconUrl('snap-guides-off.svg'),
  //snapGuidesOn: iconUrl('snap-guides-on.svg'),
  alignToWall: iconUrl('align-to-wall.svg'),
  angleLocked: iconUrl('angle-locked.svg'),
  angleUnlocked: iconUrl('angle-unlocked.svg'),
  aspectLocked: iconUrl('aspect-locked.svg'),
  aspectUnlocked: iconUrl('aspect-unlocked.svg'),
  axisLocked: iconUrl('axis-locked.svg'),
  axisUnlocked: iconUrl('axis-unlocked.svg'),
  axisX: iconUrl('axis-x.svg'),
  axisY: iconUrl('axis-y.svg'),
  blue: iconUrl('blue.svg'),
  centerOnWall: iconUrl('center-on-wall.svg'),
  door: iconUrl('door.svg'),
  editRedo: iconUrl('redo.svg'),
  editUndo: iconUrl('undo.svg'),
  exportImage: iconUrl('export-png.svg'),
  furniture: iconUrl('furniture.svg'),
  flipH: iconUrl('fliph.svg'),
  flipV: iconUrl('flipv.svg'),
  green: iconUrl('green.svg'),
  heartInfo: iconUrl('heart-info.svg'),
  hideAngles: iconUrl('hide-angles.svg'),
  hideDoorArcs: iconUrl('hide-door-arcs.svg'),
  hideDoors: iconUrl('hide-doors.svg'),
  hideFurniture: iconUrl('hide-furniture.svg'),
  hideFurnitureLabels: iconUrl('hide-furniture-labels.svg'),
  hideGrid: iconUrl('hide-grid.svg'),
  hideGuides: iconUrl('hide-guides.svg'),
  hideImages: iconUrl('hide-images.svg'),
  hideJoints: iconUrl('hide-joints.svg'),
  hideLengths: iconUrl('hide-lengths.svg'),
  hideRoomLabels: iconUrl('hide-room-labels.svg'),
  invisible: iconUrl('eye-closed.svg'),
  image: iconUrl('image.svg'),
  imageUpload: iconUrl('image-upload.svg'),
  jointTool: iconUrl('joint-tool.svg'),
  kinematicsOff: iconUrl('kinematics-off.svg'),
  kinematicsOn: iconUrl('kinematics-on.svg'),
  lengthLocked: iconUrl('length-locked.svg'),
  lengthUnlocked: iconUrl('length-unlocked.svg'),
  lockSmall: iconUrl('lock-small.png'),
  moveToWall: iconUrl('move-to-wall.svg'),
  moveToCorner: iconUrl('move-to-corner.svg'),
  newFile: iconUrl('new-page.svg'),
  openFile: iconUrl('open-file.svg'),
  panTool: iconUrl('grab.svg'),
  pen: iconUrl('pen.svg'),
  pink: iconUrl('pink.svg'),
  plain: iconUrl('plain.svg'),
  pointerTool: iconUrl('cursor.svg'),
  posLocked: iconUrl('pos-locked.svg'),
  posUnlocked: iconUrl('pos-unlocked.svg'),
  purple: iconUrl('purple.svg'),
  recenter: iconUrl('recenter.svg'),
  resetAspectRatio: iconUrl('reset-aspect-ratio.svg'),
  roomTool: iconUrl('draw-room.svg'),
  rotate: iconUrl('rotate.svg'),
  rulerCursor: iconUrl('ruler-cursor.svg'),
  rulerTool: iconUrl('ruler.svg'),
  saveFile: iconUrl('save-file.svg'),
  showAngles: iconUrl('show-angles.svg'),
  showDoorArcs: iconUrl('show-door-arcs.svg'),
  showDoors: iconUrl('show-doors.svg'),
  showFurniture: iconUrl('show-furniture.svg'),
  showFurnitureLabels: iconUrl('show-furniture-labels.svg'),
  showGrid: iconUrl('show-grid.svg'),
  showGuides: iconUrl('show-guides.svg'),
  showImages: iconUrl('show-images.svg'),
  showJoints: iconUrl('show-joints.svg'),
  showLengths: iconUrl('show-lengths.svg'),
  showRoomLabels: iconUrl('show-room-labels.svg'),
  snapGeomOff: iconUrl('snap-geom-off.svg'),
  snapGeomOn: iconUrl('snap-geom-on.svg'),
  snapGlobalOff: iconUrl('snap-global-off.svg'),
  snapGlobalOn: iconUrl('snap-global-on.svg'),
  snapGridOff: iconUrl('grid-snap-off.svg'),
  snapGridOn: iconUrl('grid-snap-on.svg'),
  snapLocalOff: iconUrl('snap-local-off.svg'),
  snapLocalOn: iconUrl('snap-local-on.svg'),
  snapOff: iconUrl('snap-off.svg'),
  snapOn: iconUrl('snap-on.svg'),
  toBack: iconUrl('to-back.svg'),
  toFront: iconUrl('to-front.svg'),
  visible: iconUrl('eye-open.svg'),
  window: iconUrl('window.svg'),
  wood: iconUrl('wood.svg'),
  zoomIn: iconUrl('zoom-in.svg'),
  zoomOut: iconUrl('zoom-out.svg'),
};

export type KeysOfToType<M extends { [key: string]: unknown }, T> = {
  [Property in keyof M]: T;
};


export type IconImages = KeysOfToType<typeof Icons, HTMLImageElement>;

export const IconImages: IconImages = ((): IconImages => {
  const result: { [key: string]: HTMLImageElement } = {};
  for (const key of Object.keys(Icons)) {
    const image = new Image();
    image.src = (Icons[key as keyof (typeof Icons)] as URL).toString();
    result[key] = image;
  }
  return result as unknown as IconImages;
})();

