import { Eid } from "@/core/ecs";
import { Degrees, Point, Radians, Vec } from "@/core/linalg";
import { Angle, Distance, Position, Spaced, SpaceName, Vector } from "@/core/spaces";
import { App } from "@/core/app";
import { Amount } from "@/core/units";

export type JsonPrimitive = string | number | boolean | Eid | Radians | Degrees;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export type JsonArray = Array<JsonValue>;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SavedComponent {
  factory: string;
  arguments: JsonArray;
}

export interface NamedSavedComponent extends SavedComponent {
  name: string;
}

export interface SavedEntity {
  id: number;
  name: string;
  components: Array<NamedSavedComponent>;
}

export interface SavedEcs {
  nextEid: number;
  entities: SavedEntity[];
}

export const MoreJsonUtil = {
  unitsFor: <S>(s: Spaced<S>): string => {
    if (s.space === 'model') return App.project.modelUnit.name;
    return s.space;
  },
  fromUnits: <S extends Position | Vector | Distance>(s: S, unit: string): S => {
    if (s.space === 'screen') return s;
    const f = App.project.modelUnit.from(new Amount(1.0, unit)).value;
    return f === 1.0 ? s : s.scale(f) as S;
  },
};

export const MoreJson = {
  point: {
    to: (p: Point): JsonObject => ({ x: p.x, y: p.y }),
    from: (json: JsonObject) => new Point(json.x! as number, json.y! as number),
  },
  vec: {
    to: (v: Vec): JsonObject => ({ x: v.x, y: v.y }),
    from: (json: JsonObject) => new Vec(json.x! as number, json.y! as number),
  },
  amount: {
    to: (a: Amount): JsonObject => ({ value: a.value, unit: a.unit }),
    from: (json: JsonObject) => new Amount(json.value! as number, json.unit! as string),
  },
  position: {
    to: (p: Position): JsonObject => ({
      x: p.get(p.space).x,
      y: p.get(p.space).y,
      space: p.space,
      unit: MoreJsonUtil.unitsFor(p),
    }),
    from: (json: JsonObject) => MoreJsonUtil.fromUnits(Position(
      new Point(json.x! as number, json.y! as number),
      json.space! as string as SpaceName,
    ), json.unit! as string),
  },
  vector: {
    to: (v: Vector): JsonObject => ({
      x: v.get(v.space).x,
      y: v.get(v.space).y,
      space: v.space,
      unit: MoreJsonUtil.unitsFor(v),
    }),
    from: (json: JsonObject) => MoreJsonUtil.fromUnits(Vector(
      new Vec(json.x! as number, json.y! as number),
      json.space! as string as SpaceName,
    ), json.unit! as string),
  },
  angle: {
    to: (a: Angle): JsonObject => ({
      angle: a.get(a.space),
      space: a.space,
    }),
    from: (json: JsonObject) => Angle(
      Radians(json.angle! as number),
      json.space! as string as SpaceName,
    ),
  },
  distance: {
    to: (d: Distance): JsonObject => ({
      d: d.get(d.space),
      space: d.space,
      unit: MoreJsonUtil.unitsFor(d),
    }),
    from: (json: JsonObject) => MoreJsonUtil.fromUnits(Distance(
      json.d! as number,
      json.space! as string as SpaceName,
    ), json.unit! as string),
  },
};

