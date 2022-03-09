import PlanParser from "../../common/planParser.mjs";
const parser = new PlanParser();

test("Parse Trivial", () => {
    const plan = tryParse("L1;A8 Barr;B5 Arti;A9 Barr;D1 Mage;E3 Mage");
    expect(plan.steps.length).toBe(5);
});

test("Implied Upgrade Levels", () => {
    const plan = tryParse("L1;A8 Tesl;A8 Over;A8 Over;A8 Over");
    expect(plan.steps.length).toBe(4);
    expect(plan.steps[1].shortAction).toEqual('y1');
    expect(plan.steps[2].shortAction).toEqual('y2');
    expect(plan.steps[3].shortAction).toEqual('y3');
});

test("Mixed Capitalization", () => {
    const planText = "L1;A8 Barr;B5 Arti;A9 Barr;D1 Mage;E3 Mage";

    let plan = tryParse(planText);
    const shortText = parser.toShortText(plan);

    plan = tryParse(planText.toUpperCase());
    expect(parser.toShortText(plan)).toEqual(shortText);

    plan = tryParse(planText.toLowerCase());
    expect(parser.toShortText(plan)).toEqual(shortText);
});

test("Comments and Empty", () => {
    const plan = tryParse("# Southport;L1;;A8 Tesl;# This'll get 'em;A8 Over3;");
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].shortAction).toEqual('t5');
    expect(plan.steps[1].shortAction).toEqual('y3');
});

test("No Map", () => {
    expect(() => tryParse("A1 Barr2")).toThrow("Plan didn't start with map (ex: 'L26').");
});

test("Incomplete at map", () => {
    expect(() => tryParse("L;")).toThrow("Line 1: Unknown map name L.");
});

test("Unknown Map", () => {
    expect(() => tryParse("L0;A1 Barr2")).toThrow("Line 1: Unknown map name L0.");
});

test("Bad Position", () => {
    expect(() => tryParse("L1;A1 Barr2")).toThrow("Line 2: Unknown position 'A1' on L1.");
});

test("No Position or Default", () => {
    expect(() => tryParse("L1;Barr2")).toThrow("Line 2: Did not have a position and action.");
});

test("No Action", () => {
    expect(() => tryParse("L1;A8")).toThrow("Line 2: Did not have a position and action.");
});

test("Unknown Action", () => {
    expect(() => tryParse("L1;A8 BBQ")).toThrow("Line 2: Unknown action 'bbq' at A8 on L1.");
});

test("Tower can't be built on existing", () => {
    expect(() => tryParse("L1;A8 Barr;A8 Mage2")).toThrow("Line 3: Can't build Mage2 on Barr at A8.");
});

test("Tower downgrade", () => {
    expect(() => tryParse("L1;A8 Barr3;A8 Barr3")).toThrow("Line 3: Tower downgrade Barr3 on Barr3 at A8.");
});

test("Upgrade on nothing", () => {
    expect(() => tryParse("L1;A8 Poly")).toThrow("Line 2: Upgrade 'Poly' on nothing at A8.");
});

test("Unknown upgrade for tower", () => {
    expect(() => tryParse("L1;A8 Arca;A8 Poly")).toThrow("Line 3: There is no 'Poly' upgrade for Arca at A8.");
});

test("Ability level out of range", () => {
    expect(() => tryParse("L1;A8 Tesl;A8 Supe3")).toThrow("Line 3: Ability upgrade to level 3 when 'Supe' max level is 2 at A8.");
});

test("Ability downgrade", () => {
    expect(() => tryParse("L1;A8 Tesl;A8 Over3;A8 Over2")).toThrow("Line 4: Ability downgrade from 'Over3' to 'Over2' at A8.");
});

function tryParse(planText) {
    planText = planText.replaceAll(";", "\n");
    const plan = parser.parse(planText);
    if (plan.errors.length > 0) { throw plan.errors[0]; }
    return plan;
}