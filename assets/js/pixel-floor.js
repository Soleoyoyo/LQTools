"use strict";

// All users share the server's saved floor. Edits remain local drafts until published.
const COLUMNS = Array.from({length:15},(_,i)=>String.fromCharCode(65+i));
const STATUSES = [
    {id:"healthy", label:"Healthy"},
    {id:"poor", label:"Poor Health"},
    {id:"replace", label:"Needs Replacing"},
    {id:"replaced", label:"Has Been Replaced"},
    {id:"multiple", label:"Has Been Replaced Multiple Times"},
    {id:"replaced-poor", label:"Has Been Replaced and Has Poor Health"},
    {id:"replaced-replace", label:"Has Been Replaced and Needs Replacing Again"}
];
const statusById = new Map(STATUSES.map(s=>[s.id,s]));
const tileIds = Array.from({length:18},(_,r)=>COLUMNS.map(c=>`${c}${r+1}`)).flat();
const grid=document.getElementById("floorGrid");
const legend=document.getElementById("statusLegend");
const editor=document.getElementById("tileEditor");
const editorTitle=document.getElementById("editorTitle");
const editorOptions=document.getElementById("editorOptions");
const saveStatus=document.getElementById("saveStatus");
const pendingCount=document.getElementById("pendingCount");
const publishButton=document.getElementById("publishFloor");
const discardButton=document.getElementById("discardDraft");
const publishMessage=document.getElementById("publishMessage");
const floorHistory=document.getElementById("floorHistory");
let savedTiles=Object.fromEntries(tileIds.map(id=>[id,"healthy"]));
let draft=new Map(); // tile => desired status
let ready=false;
let activeTile=null, activeButton=null;
let busy=false;
const tileButtons=new Map(),legendCounts=new Map();
const config = window.LQ_FLOOR_CONFIG || {};
const dbUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
const dbKey = String(config.supabaseAnonKey || "");
const configured = /^https:\/\/.+\.supabase\.co$/.test(dbUrl) &&
    dbKey.length > 15 && !dbKey.includes("YOUR_");
const connectionWarning = document.getElementById("floorConnectionWarning");
const retryConnectionButton = document.getElementById("retryFloorConnection");
let hasLoadedFloor = false;
let connectionChecked = false;

function setConnected(connected) {
    ready = connected;
    connectionWarning.hidden = connected || !connectionChecked;
    render();
}



function currentStatus(tile) {return draft.get(tile) ?? savedTiles[tile];}
function makeSwatch(status, cls) {const el=document.createElement("span");el.className=`${cls} status-${status}`;el.setAttribute("aria-hidden","true");return el;}
function label(text) {const el=document.createElement("span");el.className="grid-label";el.textContent=text;return el;}
function makeGrid() {
    grid.appendChild(label(""));
    COLUMNS.forEach(c=>grid.appendChild(label(c)));
    for(let r=1;r<=18;r++) {
        grid.appendChild(label(String(r)));
        COLUMNS.forEach(c=>{
            const id=`${c}${r}`;
            const button=document.createElement("button");
            button.type="button"; button.className="floor-tile";button.dataset.tileId=id;
            button.setAttribute("aria-haspopup","true");button.setAttribute("aria-expanded","false");
            button.setAttribute("aria-pressed","false");
            const content=document.createElement("span");content.className="tile-label";content.textContent=id;
            button.append(content);tileButtons.set(id,button);grid.append(button);
        });
    }
}
function makeLegend() {
    for(const status of STATUSES) {
        const card=document.createElement("div");card.className="legend-item";
        const name=document.createElement("span");name.className="legend-name";name.textContent=status.label;
        const count=document.createElement("strong");count.className="legend-count";
        legendCounts.set(status.id,count);
        card.append(makeSwatch(status.id,"legend-swatch"),name,count);legend.append(card);
        const option=document.createElement("button");option.type="button";option.className="editor-option";option.dataset.status=status.id;
        const text=document.createElement("span");text.textContent=status.label;
        option.append(makeSwatch(status.id,"editor-swatch"),text);editorOptions.append(option);
    }
}
function render() {
    const counts=Object.fromEntries(STATUSES.map(s=>[s.id,0]));
    for(const id of tileIds) {
        const status=currentStatus(id),button=tileButtons.get(id);
        counts[status]++;
        button.className=`floor-tile status-${status}${draft.has(id)?" is-pending":""}`;
        button.title=`${id}: ${statusById.get(status).label}${draft.has(id)?" (not published)":""}`;
        button.setAttribute("aria-label",button.title);
    }
    STATUSES.forEach(s=>legendCounts.get(s.id).textContent=String(counts[s.id]));
    pendingCount.textContent=`${draft.size} pending`;
    publishButton.disabled=!ready||busy||draft.size===0;
    discardButton.disabled=!hasLoadedFloor||busy||draft.size===0;
    document.getElementById("resetFloor").disabled=!hasLoadedFloor||busy;
    saveStatus.textContent=!ready?(connectionChecked?(hasLoadedFloor?"Server unreachable — draft only":"Server unreachable — floor unavailable"):"Connecting to shared floor…"):draft.size?`${draft.size} unsaved change${draft.size===1?"":"s"}`:"Shared floor up to date";
}
function stage(tile,status) {
    if (!hasLoadedFloor||busy) return;
    if(status===savedTiles[tile]) draft.delete(tile);
    else draft.set(tile,status);
    publishMessage.textContent="";
    render();
}
function positionEditor() {
    if(editor.hidden||!activeButton) return;
    const box=activeButton.getBoundingClientRect(), width=editor.offsetWidth,height=editor.offsetHeight, margin=12,gap=10;
    editor.style.left=`${Math.max(margin,Math.min(innerWidth-width-margin,box.left))}px`;
    const below=innerHeight-box.bottom>=height+gap;
    editor.style.top=`${Math.max(margin,Math.min(innerHeight-height-margin,below?box.bottom+gap:box.top-height-gap))}px`;
}
function closeEditor(focus=false) {
    if(activeButton) {activeButton.setAttribute("aria-pressed","false");activeButton.setAttribute("aria-expanded","false");if(focus)activeButton.focus();}
    activeTile=null;activeButton=null;editor.hidden=true;
}
function openEditor(tile) {
    if(!hasLoadedFloor||busy)return;
    if(activeTile===tile){closeEditor();return;}
    closeEditor();activeTile=tile;activeButton=tileButtons.get(tile);
    editorTitle.textContent=`Tile ${tile}`;activeButton.setAttribute("aria-pressed","true");activeButton.setAttribute("aria-expanded","true");
    [...editorOptions.children].forEach(option=>option.setAttribute("aria-pressed",String(option.dataset.status===currentStatus(tile))));
    editor.hidden=false;positionEditor();
}
async function dbRequest(path, options = {}) {
    if (!configured) throw new Error("Shared floor connection unavailable.");
    const response = await fetch(`${dbUrl}/rest/v1/${path}`, {
        cache: "no-store",
        ...options,
        headers: {
            apikey: dbKey,
            Authorization: `Bearer ${dbKey}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const message = body?.message || body?.error || `HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.response = body;
        throw error;
    }
    return body;
}

async function refreshFloor(quiet = false) {
    if (busy) return;
    if (!configured) {
        connectionChecked = true;
        setConnected(false);
        return;
    }
    try {
        const rows = await dbRequest("floor_state?select=tiles,version&id=eq.1");
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Floor database not initialised.");
        const received = rows[0].tiles;
        for (const tile of tileIds) {
            if (!statusById.has(received[tile])) throw new Error(`Invalid saved tile ${tile}`);
        }
        savedTiles = received;
        for (const [tile, status] of draft) {
            if (savedTiles[tile] === status) draft.delete(tile);
        }
        hasLoadedFloor = true;
        connectionChecked = true;
        setConnected(true);
        try {
            await refreshHistory();
        } catch (historyError) {
            // A history loading error should not block editing when the floor itself loaded.
            console.warn("Floor update history unavailable:", historyError);
        }
        if (!quiet) publishMessage.textContent = "Shared floor refreshed.";
    } catch (error) {
        connectionChecked = true;
        setConnected(false);
        if (!quiet || !window.__floorLoadErrorShown) {
            publishMessage.textContent = "Unable to reach the shared floor. Please retry when the connection is restored.";
            window.__floorLoadErrorShown = true;
        }
    }
}
function textEl(tag,cls,text) {const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=text;return el;}
async function refreshHistory() {
    const updates = await dbRequest("floor_updates?select=author,created_at,changes&order=created_at.desc&limit=60");
    floorHistory.replaceChildren();
    if (!updates.length) {
        floorHistory.append(textEl("p", "empty-history", "No floor updates have been published yet."));
        return;
    }
    for (const item of updates) {
        const row = textEl("article", "history-entry", "");
        const top = textEl("div", "history-top", "");
        top.append(
            textEl("strong", null, item.author),
            textEl("time", null, new Date(item.created_at).toLocaleString("en-AU", {
                dateStyle: "medium", timeStyle: "short"
            }))
        );
        const desc = textEl("p", null, `${item.changes.length} tile${item.changes.length === 1 ? "" : "s"} changed`);
        const detail = textEl("details", null, "");
        detail.append(textEl("summary", null, "View changes"));
        const list = textEl("ul", null, "");
        for (const change of item.changes) {
            list.append(textEl("li", null, `${change.tile}: ${statusById.get(change.from)?.label || change.from} → ${statusById.get(change.status)?.label || change.status}`));
        }
        detail.append(list);
        row.append(top, desc, detail);
        floorHistory.append(row);
    }
}

async function publish() {
    if (!ready || busy || !draft.size) return;
    const nameInput = document.getElementById("editorName");
    const name = nameInput.value.trim();
    if (name.length < 2) {
        publishMessage.textContent = "Enter your name (at least 2 characters) before publishing.";
        nameInput.focus();
        return;
    }
    const changes = [...draft].map(([tile, status]) => ({ tile, status, from: savedTiles[tile] }));
    busy = true;
    render();
    publishMessage.textContent = "Publishing changes…";
    try {
        const data = await dbRequest("rpc/publish_floor_update", {
            method: "POST",
            body: JSON.stringify({ p_name: name, p_changes: changes })
        });
        savedTiles = data.tiles;
        draft.clear();
        publishMessage.textContent = `Published ${data.saved} tile change${data.saved === 1 ? "" : "s"} as ${name}.`;
        await refreshHistory();
    } catch (error) {
        if (error.message.includes("FLOOR_CONFLICT")) {
            publishMessage.textContent = "Someone changed one of those tiles first. Your draft is preserved. Click Refresh, review the floor and try publishing again.";
        } else {
            // A failed request can have an uncertain outcome, so keep the draft until refreshed.
            publishMessage.textContent = `Unable to confirm the update: ${error.message}. Reconnect and refresh before publishing again.`;
            if (!error.status) setConnected(false);
        }
    } finally {
        busy = false;
        render();
    }
}

grid.addEventListener("click",event=>{const tile=event.target.closest(".floor-tile");if(tile)openEditor(tile.dataset.tileId);});
editorOptions.addEventListener("click",event=>{const option=event.target.closest(".editor-option");if(option&&activeTile){stage(activeTile,option.dataset.status);closeEditor(true);}});
document.getElementById("closeEditor").addEventListener("click",()=>closeEditor(true));
document.addEventListener("pointerdown",event=>{if(!editor.hidden&&!editor.contains(event.target)&&!event.target.closest(".floor-tile"))closeEditor();});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!editor.hidden){event.preventDefault();closeEditor(true);}});
window.addEventListener("resize",positionEditor);
document.querySelector(".floor-scroll").addEventListener("scroll",()=>closeEditor(),{passive:true});
window.addEventListener("scroll",()=>closeEditor(),{passive:true});
document.getElementById("resetFloor").addEventListener("click",()=>{
    if(!confirm("Mark all 270 tiles Healthy in your draft? You must still publish this change with your name."))return;
    closeEditor();tileIds.forEach(tile=>stage(tile,"healthy"));render();
});
publishButton.addEventListener("click",publish);
discardButton.addEventListener("click",()=>{if(!confirm("Discard all unpublished changes?"))return;draft.clear();render();publishMessage.textContent="Draft discarded.";});
document.getElementById("refreshFloor").addEventListener("click",()=>refreshFloor(false));
retryConnectionButton.addEventListener("click", () => refreshFloor(false));
window.addEventListener("offline", () => setConnected(false));
window.addEventListener("online", () => refreshFloor(false));
makeGrid();makeLegend();render();refreshFloor(false);
setInterval(()=>refreshFloor(true),10000);
