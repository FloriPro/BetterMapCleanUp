import { flushSync } from "svelte";
import { expect, test, beforeAll, describe, it } from "vitest";
import { search, SearchRoomResponse } from "$lib/searchEngine";
import api from "./api/api";

beforeAll(async () => {
    await api.getData();
});

const all = true;

/**
 * @param {{ name: string; buildingName?: string }} target
 * @param {string[]} searches
 */
function doTests(target, searches) {
    for (let el of searches) {
        test(el, () => {
            expect(search(el)[0]).toMatchObject(target);
        });
    }
}

describe("F 5.001 search", () => {
    let target = { name: "F 5.001", buildingName: "Butenandtstr. 1-13" };
    let searches = [
        "F 5.001",
        "F5001",
        "F5.001",
        "F 5001",
        "Butenandtstr F5.001",
        "Butenandtstr F 5.001",
        "Butenandtstr F 5001",
        "Butenandtstr F5001",
        "F5.001 Butenandtstr",
        "F5.001 But",
        "F 5.001 Butenandtstr",
        "F 5.001 But",
        "F 5001 Butenandtstr",
        "F 5001 But",
        "F5001 Butenandtstr",
        "F5001 But",
        "But F5001",
        "F5001",
    ];
    if (all) doTests(target, searches);
    else test("paused", () => {});
});
describe("A 240 search", () => {
    let target = { name: "A 240", buildingName: "Geschwister-Scholl-Platz 01" };
    let searches = [
        "Geschwister-Scholl-Platz 01 A 240",
        "Raum A 240 Geschwister-Scholl-Platz 01",
        "Geschwister-Scholl-Platz 1 Raum A 240",
        "A 240",
        "A 240 GSP 01",
        "A 240 Geschwister-Scholl",
        "Geschwister Scholl Platz 01 A240",
        "Gebäude A 240 Geschwister-Scholl-Platz",
        "GSP A240",
    ];
    if (all) doTests(target, searches);
    else test("paused", () => {});
});

describe("U105 Oettingen search", () => {
    let target = { name: "U105", buildingName: "Oettingenstr. 67" };
    let searches = [
        "U105 oet",
        "oet U105",
        "U105 öt",
        "ött U105",
        "Oettingenstr. 67 U105",
        "U105 Oettingenstr. 67",
        "Raum U105 Oettingenstr. 67",
        "U 105 Oettingenstr. 67",
        "Oettingen str. 67 U105",
        "Oettingenstr. 67 Gebäude U105",
        "Oettingenstr 67 U105",

        "U105 Oett",
        "Oett U105",
        "Oett67 U105",
        "U105 Oett67",
        "U105 Oett.",
        "Oettingen U105",
    ];
    if (all) doTests(target, searches);
    else test("paused", () => {});
});

describe("WCs H", () => {
    let target = { name: "Toilette Herren" };
    let searches = [
        "Toilette Herren",
        "WCh",
        "WC-H",
        "Wc herrent",
        "männer klo",
        "klo h",
    ];

    if (all) doTests(target, searches);
    else test("paused", () => {});
});

describe("WCs D", () => {
    let target = { name: "Toilette Damen" };
    let searches = [
        "Toilette Damen",
        "WCd",
        "WC-D",
        "Wc damten",
        "frauen klo",
        "klo f",
    ];

    if (all) doTests(target, searches);
    else test("paused", () => {});
});

describe("Empty and Whitespace-only Input", () => {
    if (!all) return test("pause", () => {});

    test("empty string", () => {
        expect(search("")).toEqual([]);
    });

    test("spaces only", () => {
        expect(search("   ")).toEqual([]);
    });

    test("tabs and newlines", () => {
        expect(search(" \t\n ")).toEqual([]);
    });
});

describe("No Match / Non-existent Rooms", () => {
    if (!all) return test("pause", () => {});
    test("completely invalid name", () => {
        expect(search("NonExistentRoomXYZ")).toEqual([]);
    });
});

describe("Umlauts and Replaced Characters", () => {
    if (!all) return test("pause", () => {});

    // ß -> ss (e.g. Großhadernerstr -> Grosshadernerstr)
    let targetGrosshadernerstr = {
        name: "A 00.001",
        buildingName: "Grosshadernerstr. 02",
    };
    let searchesGross = [
        "Großhadernerstr A 00.001",
        "großhadernerstr. 02 A 00.001",
        "Großhadernerstr. 2 Raum A 00.001",
    ];
    doTests(targetGrosshadernerstr, searchesGross);

    // ö -> o (e.g. Schönfeldstr -> Schonfeldstr)
    let targetSchonfeld = { name: "005", buildingName: "Schönfeldstr. 13a" };
    let searchesSchon = [
        "Schonfeldstr 005",
        "schonfeldstr. 13a 005",
        "Schönfeldstr 13a Raum 005",
    ];
    doTests(targetSchonfeld, searchesSchon);
});

describe("Multi-result Sorting Order & Bestuhlung", () => {
    if (!all) return test("pause", () => {});

    test("sort by bestuhlung descending when similarity is equal", () => {
        const results = /**
         * @type {SearchRoomResponse[]}
         */ (search("101"));
        expect(results.length).toBeGreaterThan(2);
        // The first result should be 101 in Amalienstr. 73 (bestuhlung: 26)
        expect(results[0].name).toBe("101");
        expect(results[0].buildingName).toBe("Amalienstr. 73");
        expect(results[0].originalRoom.bestuhlung).toBe(26);

        // The second result should be 101 in Schellingstr. 09 (bestuhlung: 20)
        expect(results[1].name).toBe("101");
        expect(results[1].buildingName).toBe("Schellingstr. 09");
        expect(results[1].originalRoom.bestuhlung).toBe(20);
    });

    test("specific building search returns that building's room first", () => {
        const results = /**
         * @type {SearchRoomResponse[]}
         */ (search("Amalienstr. 73 101"));
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe("101");
        expect(results[0].buildingName).toBe("Amalienstr. 73");
    });
});

describe("Marker Proposals Expansion", () => {
    if (!all) return test("pause", () => {});

    test("searching for 'toilette' returns both toilet proposals", () => {
        const results = search("toilette");
        const markerProposals = results.filter((r) => r.actuallyMarkerProposal);
        expect(markerProposals.length).toBe(2);
        expect(markerProposals.map((r) => r.name)).toContain("Toilette Damen");
        expect(markerProposals.map((r) => r.name)).toContain("Toilette Herren");
    });

    test("searching for 'klo' returns both toilet proposals", () => {
        const results = search("klo");
        const markerProposals = results.filter((r) => r.actuallyMarkerProposal);
        expect(markerProposals.length).toBe(2);
        expect(markerProposals.map((r) => r.name)).toContain("Toilette Damen");
        expect(markerProposals.map((r) => r.name)).toContain("Toilette Herren");
    });

    test("searching for gender-specific aliases returns that toilet proposal first", () => {
        const menResults = search("männer");
        expect(menResults[0].actuallyMarkerProposal).toBe(true);
        expect(menResults[0].name).toBe("Toilette Herren");

        const womenResults = search("frauen");
        expect(womenResults[0].actuallyMarkerProposal).toBe(true);
        expect(womenResults[0].name).toBe("Toilette Damen");
    });
});
