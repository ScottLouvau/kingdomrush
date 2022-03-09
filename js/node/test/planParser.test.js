import PlanParser from "../../common/planParser.mjs";
const parser = new PlanParser();

test("Parse Trivial", () => {
    const plan = roundTrip("L1:A8pB5tA9pD1sE3s");
    expect(plan.steps.length).toBe(5);
});

test("Implied Positions", () => {
    const plan = roundTrip("L1:A8pp2p3");
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].positionName).toEqual('A8');
    expect(plan.steps[1].positionName).toEqual('A8');
    expect(plan.steps[2].positionName).toEqual('A8');
});

test("Implied Tower Levels", () => {
    const plan = parser.parseShort("L1:A8ppp");
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0].base.sn).toEqual('p1');
    expect(plan.steps[1].base.sn).toEqual('p2');
    expect(plan.steps[2].base.sn).toEqual('p3');
});

test("Implied Upgrade Levels", () => {
    const plan = parser.parseShort("L1:A8t5yyy");
    expect(plan.steps.length).toBe(4);
    expect(plan.steps[1].shortAction).toEqual('y1');
    expect(plan.steps[2].shortAction).toEqual('y2');
    expect(plan.steps[3].shortAction).toEqual('y3');
});

test("Mixed Capitalization", () => {
    const planText = "L1:A8pB5tA9pD1sE3sA8p4x2";

    let plan = parser.parseShort(planText.toUpperCase());
    expect(parser.toShortText(plan)).toEqual(planText);

    plan = parser.parseShort(planText.toLowerCase());
    expect(parser.toShortText(plan)).toEqual(planText);
});

test("Whitespace and Separators", () => {
    let plan = parser.parseShort("L1:A8pB5tA9pD1sE3s");
    const planText = parser.toShortText(plan);

    plan = parser.parseShort("L1:A8p B5t A9p D1s E3s");
    expect(parser.toShortText(plan)).toEqual(planText);

    plan = parser.parseShort("L1:A8p.B5t.A9p.D1s.E3s");
    expect(parser.toShortText(plan)).toEqual(planText);

    plan = parser.parseShort("L1:A8p;B5t;A9p;D1s;E3s");
    expect(parser.toShortText(plan)).toEqual(planText);

    plan = parser.parseShort("L1:A8p B5t;A9p\rD1s\nE3s");
    expect(parser.toShortText(plan)).toEqual(planText);
});

test("No Map", () => {
    expect(() => roundTrip("A1p2")).toThrow("Plan didn't start with map (ex: 'L26').");
});

test("Incomplete at map", () => {
    expect(() => roundTrip("L")).toThrow("Plan must have ':' after map name (ex: 'L26:').");
});

test("Unknown Map", () => {
    expect(() => roundTrip("L0:A1p2")).toThrow("@3: Unknown map 'L0' at beginning of plan.");
});

test("Unterminated Map", () => {
    expect(() => roundTrip("L1A1p2")).toThrow("Plan must have ':' after map name (ex: 'L26:').");
});

test("Bad Position", () => {
    expect(() => roundTrip("L1:A1p2")).toThrow("@5: Unknown position 'A1'.");
});

test("No Position or Default", () => {
    expect(() => roundTrip("L1:p2")).toThrow("@3: No position provided and no previous position to re-use.");
});

test("No Position or Default", () => {
    expect(() => roundTrip("L1:p2")).toThrow("@3: No position provided and no previous position to re-use.");
});

test("No Action (End)", () => {
    expect(() => roundTrip("L1:A8")).toThrow("@5: Incomplete step at end of plan.");
});

test("No Action (Middle)", () => {
    expect(() => roundTrip("L1:A8A9")).toThrow("@5: Unknown action a9.");
});

test("Unknown Action", () => {
    expect(() => roundTrip("L1:A8m4")).toThrow("@5: Unknown action m4.");
});

test("Tower can't be built on existing", () => {
    expect(() => roundTrip("L1:A8pA8s")).toThrow("@9: Can't build Mage2 on Barr at A8.");
});

test("Tower downgrade", () => {
    expect(() => roundTrip("L1:A8p3A8p3")).toThrow("@11: Tower downgrade Barr3 on Barr3 at A8.");
});

test("Upgrade on nothing", () => {
    expect(() => roundTrip("L1:A8x2")).toThrow("@7: Upgrade 'x' on nothing at A8.");
});

test("Unknown upgrade for tower", () => {
    expect(() => roundTrip("L1:A8s4z1")).toThrow("@9: There is no 'z' upgrade for Arca at A8.");
});

test("Ability level out of range", () => {
    expect(() => roundTrip("L1:A8t5x3")).toThrow("@9: Ability upgrade to level 3 when Supe max level is 2 at A8.");
});

test("Ability downgrade", () => {
    expect(() => roundTrip("L1:A8t5y3y2")).toThrow("@11: Ability downgrade from 'y3' to 'y2' at A8.");
});

function roundTrip(planText) {
    const plan = parser.parseShort(planText);
    expect(plan.errors.length).toBe(0);
    expect(parser.toShortText(plan)).toEqual(planText);
    return plan;
}