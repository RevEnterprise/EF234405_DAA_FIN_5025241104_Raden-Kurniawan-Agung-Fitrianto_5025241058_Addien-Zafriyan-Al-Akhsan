const MAP_PRESETS = {
    surabaya: {
        file: 'data/surabaya.json',
        start: '[824.4548226413915, 703.2638977179685]',
        dest: '[127.88505594841665, 95.77207809443428]'
    },
    nodes5000: {
        file: 'data/5000nodes.json',
        start: '[102, 2888]',
        dest: '[3439, 252]'
    },
    nodes1000: {
        file: 'data/1000nodes.json',
        start: '[710, 2717]',
        dest: '[3387, 70]'
    }
};

// App State & Visual Settings
let graphData = null;
let startNodeKey = null;
let destinationNodeKey = null;
let selectedNodeFromContext = null;

// Zoom & Pan transformation state
let transform = { scale: 1, offsetX: 0, offsetY: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

// Step-by-step timeline execution state
let stepsData = { visited: [], path: [] };
let currentStep = 0;
let totalSteps = 0;

const canvas = document.getElementById('roadNetworkCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');
const contextMenu = document.getElementById('contextMenu');

let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
const padding = 50; 

// 3. Dynamic Preset Switcher & Loader Pipeline
async function switchMapPreset(presetKey) {
    const config = MAP_PRESETS[presetKey];
    if (!config) return;

    window.clearStepTimeline();
    await loadGraphData(config.file);
    calculateBounds();

    // Set designated coordinate points safely
    startNodeKey = config.start;
    destinationNodeKey = config.dest;
    document.getElementById('startNodeInput').value = startNodeKey;
    document.getElementById('destinationNodeInput').value = destinationNodeKey;

    transform = { scale: 1, offsetX: 0, offsetY: 0 };
    drawNetwork();
}

async function loadGraphData(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
        graphData = await response.json();
        filterMainConnectedComponent();
    } catch (error) {
        console.error(`Failed to load graph target context (${filePath}):`, error);
        showToast(`Map asset not found at ${filePath}. Check directory files!`);
        graphData = { nodes: {} };
    }
}

function parseCoords(coordStr) {
    return JSON.parse(coordStr);
}

function filterMainConnectedComponent() {
    if (!graphData || !graphData.nodes || Object.keys(graphData.nodes).length === 0) return;
    
    const adj = {};
    const nodes = Object.keys(graphData.nodes);
    
    nodes.forEach(u => {
        if (!adj[u]) adj[u] = [];
        graphData.nodes[u].forEach(edge => {
            const v = edge.node;
            if (!adj[v]) adj[v] = [];
            adj[u].push(v);
            adj[v].push(u);
        });
    });

    const visited = new Set();
    let components = [];

    nodes.forEach(node => {
        if (!visited.has(node)) {
            const component = [];
            const queue = [node];
            visited.add(node);
            
            while (queue.length > 0) {
                const curr = queue.shift();
                component.push(curr);
                (adj[curr] || []).forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                });
            }
            components.push(component);
        }
    });

    components.sort((a, b) => b.length - a.length);
    const mainComponentNodes = new Set(components[0] || []);

    const filteredNodes = {};
    nodes.forEach(node => {
        if (mainComponentNodes.has(node)) {
            filteredNodes[node] = graphData.nodes[node].filter(edge => mainComponentNodes.has(edge.node));
        }
    });
    graphData.nodes = filteredNodes;
}

// 4. Agent-Based Procedural Generation Engine (For custom local generation overrides)
function generateProceduralGraph(nodeCount) {
    const widthBounds = 4000;  
    const heightBounds = 3000;
    const stepDist = 24;       
    const cellSize = 60;       
    
    const generatedGraph = { nodes: {} };
    const nodesList = [];
    const spatialGrid = {};

    function getGridKey(x, y) {
        return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    }
    function insertToGrid(node) {
        const key = getGridKey(node.x, node.y);
        if (!spatialGrid[key]) spatialGrid[key] = [];
        spatialGrid[key].push(node);
    }
    
    function findNearbyNode(x, y, maxR) {
        const cx = Math.floor(x / cellSize);
        const cy = Math.floor(y / cellSize);
        let closest = null;
        let minDist = Infinity;
        const rCells = Math.ceil(maxR / cellSize);

        for (let dx = -rCells; dx <= rCells; dx++) {
            for (let dy = -rCells; dy <= rCells; dy++) {
                const cell = spatialGrid[`${cx + dx},${cy + dy}`];
                if (cell) {
                    for (let n of cell) {
                        const d = Math.hypot(n.x - x, n.y - y);
                        if (d < maxR && d < minDist) {
                            minDist = d;
                            closest = n;
                        }
                    }
                }
            }
        }
        return closest;
    }

    function registerNode(x, y) {
        const key = `[${Math.round(x)}, ${Math.round(y)}]`;
        if (generatedGraph.nodes[key]) return nodesList.find(n => n.key === key);
        
        const nodeObj = { x, y, key };
        generatedGraph.nodes[key] = [];
        nodesList.push(nodeObj);
        insertToGrid(nodeObj);
        return nodeObj;
    }

    function addRoad(u, v) {
        if (u.key === v.key) return;
        const d = Math.round(Math.hypot(u.x - v.x, u.y - v.y));
        if (!generatedGraph.nodes[u.key].some(e => e.node === v.key)) {
            generatedGraph.nodes[u.key].push({ node: v.key, weight: d });
        }
        if (!generatedGraph.nodes[v.key].some(e => e.node === u.key)) {
            generatedGraph.nodes[v.key].push({ node: u.key, weight: d });
        }
    }

    let fronts = [];
    const seedCount = 8;
    for (let i = 0; i < seedCount; i++) {
        const x = Math.floor(Math.random() * (widthBounds - 600)) + 300;
        const y = Math.floor(Math.random() * (heightBounds - 600)) + 300;
        const angle = Math.random() * Math.PI * 2;
        const startNode = registerNode(x, y);
        fronts.push({ x, y, angle, lastNode: startNode, type: 'highway', life: 120 });
    }

    let safetyCounter = 0;
    while (nodesList.length < nodeCount && safetyCounter < nodeCount * 40) {
        safetyCounter++;

        if (fronts.length === 0) {
            const parent = nodesList[Math.floor(Math.random() * nodesList.length)];
            const angle = Math.random() * Math.PI * 2;
            fronts.push({ x: parent.x, y: parent.y, angle, lastNode: parent, type: 'street', life: 40 });
            continue;
        }

        const fIdx = Math.floor(Math.random() * fronts.length);
        const f = fronts[fIdx];

        const nextX = f.x + Math.cos(f.angle) * stepDist;
        const nextY = f.y + Math.sin(f.angle) * stepDist;

        if (nextX < 40 || nextX > widthBounds - 40 || nextY < 40 || nextY > heightBounds - 40) {
            fronts.splice(fIdx, 1);
            continue;
        }

        const snapNode = findNearbyNode(nextX, nextY, stepDist * 0.85);
        if (snapNode) {
            addRoad(f.lastNode, snapNode);
            fronts.splice(fIdx, 1); 
            continue;
        }

        const newNode = registerNode(nextX, nextY);
        addRoad(f.lastNode, newNode);

        f.x = nextX; f.y = nextY; f.lastNode = newNode; f.life--;

        if (f.life <= 0) {
            fronts.splice(fIdx, 1);
            continue;
        }

        const turnProb = f.type === 'highway' ? 0.02 : 0.09;
        const forkProb = f.type === 'highway' ? 0.015 : 0.05;

        if (Math.random() < turnProb) {
            const turnAngle = Math.random() < 0.6 ? (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2) : (Math.random() - 0.5) * 0.4;
            f.angle += turnAngle;
        }

        if (Math.random() < forkProb && fronts.length < 50) {
            const forkAngle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
            fronts.push({
                x: nextX, y: nextY, angle: f.angle + forkAngle, lastNode: newNode, type: 'street', life: f.type === 'highway' ? 50 : 25
            });
        }
    }

    graphData = generatedGraph;
    startNodeKey = null; destinationNodeKey = null;
    document.getElementById('startNodeInput').value = '';
    document.getElementById('destinationNodeInput').value = '';
    window.clearStepTimeline();
    
    document.getElementById('mapPresetSelect').value = "";
    
    calculateBounds();
    // Reset transform matrix on custom generation too
    transform = { scale: 1, offsetX: 0, offsetY: 0 };
    drawNetwork();
    showToast(`Successfully generated organic infrastructure with ${nodesList.length} nodes!`);
}

function saveGraphToFile() {
    if (!graphData || Object.keys(graphData.nodes).length === 0) {
        return showToast("No map network configuration available to save.");
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "graph_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Transform Projections (Accounts for scaling + Pan/Zoom offsets)
function calculateBounds() {
    if (!graphData || !graphData.nodes || Object.keys(graphData.nodes).length === 0) return;
    minX = Infinity; maxX = -Infinity;
    minY = Infinity; maxY = -Infinity;

    Object.keys(graphData.nodes).forEach(key => {
        const [x, y] = parseCoords(key);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
}

function convertToScreen(x, y) {
    const dataWidth = maxX - minX;
    const dataHeight = maxY - minY;

    const scaleX = dataWidth === 0 ? 1 : (canvas.width - padding * 2) / dataWidth;
    const scaleY = dataHeight === 0 ? 1 : (canvas.height - padding * 2) / dataHeight;
    const baseScale = Math.min(scaleX, scaleY);

    const baseOffsetX = (canvas.width - dataWidth * baseScale) / 2;
    const baseOffsetY = (canvas.height - dataHeight * baseScale) / 2;

    const lx = baseOffsetX + (x - minX) * baseScale;
    const ly = canvas.height - (baseOffsetY + (y - minY) * baseScale);

    return {
        x: lx * transform.scale + transform.offsetX,
        y: ly * transform.scale + transform.offsetY
    };
}

function getClosestNode(mouseX, mouseY) {
    if (!graphData || !graphData.nodes) return null;
    let closestKey = null;
    let minDistance = Infinity;
    const clickThreshold = 25;

    Object.keys(graphData.nodes).forEach(key => {
        const [x, y] = parseCoords(key);
        const screenPos = convertToScreen(x, y);
        const dist = Math.hypot(screenPos.x - mouseX, screenPos.y - mouseY);

        if (dist < minDistance) {
            minDistance = dist;
            closestKey = key;
        }
    });
    return minDistance <= clickThreshold ? closestKey : null;
}

// Zoom & Pan Controls Setup
function setupInteractions() {
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            isDragging = true;
            dragStart.x = e.clientX - transform.offsetX;
            dragStart.y = e.clientY - transform.offsetY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            transform.offsetX = e.clientX - dragStart.x;
            transform.offsetY = e.clientY - dragStart.y;
            drawNetwork();
        }
    });

    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.12;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const layoutX = (mouseX - transform.offsetX) / transform.scale;
        const layoutY = (mouseY - transform.offsetY) / transform.scale;

        if (e.deltaY < 0) transform.scale *= zoomFactor;
        else transform.scale /= zoomFactor;
        
        transform.scale = Math.max(0.01, Math.min(transform.scale, 35));
        transform.offsetX = mouseX - layoutX * transform.scale;
        transform.offsetY = mouseY - layoutY * transform.scale;
        
        drawNetwork();
    }, { passive: false });
}

// Fast Canvas Render Loop Engine
function drawNetwork() {
    if (!graphData || !graphData.nodes || Object.keys(graphData.nodes).length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- DRAW BASE ROADS ---
    ctx.strokeStyle = '#cbd5e1'; 
    ctx.lineWidth = Math.max(1.2, 3.5 * transform.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    Object.keys(graphData.nodes).forEach(sourceKey => {
        const [sx, sy] = parseCoords(sourceKey);
        const sourceScreen = convertToScreen(sx, sy);

        graphData.nodes[sourceKey].forEach(edge => {
            const [tx, ty] = parseCoords(edge.node);
            const targetScreen = convertToScreen(tx, ty);

            ctx.beginPath();
            ctx.moveTo(sourceScreen.x, sourceScreen.y);
            ctx.lineTo(targetScreen.x, targetScreen.y);
            ctx.stroke();
        });
    });

    // --- DRAW SEARCH EXPLORATION TRACKER ---
    if (totalSteps > 0) {
        const activeVisited = stepsData.visited.slice(0, currentStep);
        activeVisited.forEach(nodeKey => {
            const [x, y] = parseCoords(nodeKey);
            const screenPos = convertToScreen(x, y);
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, Math.max(1.8, 3.8 * transform.scale), 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(66, 153, 225, 0.6)';
            ctx.fill();
        });

        // HIGHLIGHT RESULT PATH
        if (currentStep === totalSteps && stepsData.path.length > 0) {
            ctx.strokeStyle = '#ecc94b'; 
            ctx.lineWidth = Math.max(2.5, 6.5 * transform.scale);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            stepsData.path.forEach((nodeKey, idx) => {
                const [x, y] = parseCoords(nodeKey);
                const screenPos = convertToScreen(x, y);
                if (idx === 0) ctx.moveTo(screenPos.x, screenPos.y);
                else ctx.lineTo(screenPos.x, screenPos.y);
            });
            ctx.stroke();
        }
    }

    // --- DRAW START / DESTINATION NODES ---
    if (startNodeKey) {
        const [x, y] = parseCoords(startNodeKey);
        const pos = convertToScreen(x, y);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#48bb78'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (destinationNodeKey) {
        const [x, y] = parseCoords(destinationNodeKey);
        const pos = convertToScreen(x, y);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 6.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f56565'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
}

// Pathfinding Core Algorithms
function runDijkstra(start, target) {
    const distances = {}; const prev = {}; const visitedOrder = []; const queue = [];
    Object.keys(graphData.nodes).forEach(n => distances[n] = Infinity);
    distances[start] = 0; queue.push({ node: start, dist: 0 });

    while (queue.length > 0) {
        queue.sort((a, b) => a.dist - b.dist);
        const { node: curr, dist: currDist } = queue.shift();

        if (currDist > distances[curr]) continue;
        if (!visitedOrder.includes(curr)) visitedOrder.push(curr);
        if (curr === target) break;

        (graphData.nodes[curr] || []).forEach(edge => {
            const alt = currDist + edge.weight;
            if (alt < distances[edge.node]) {
                distances[edge.node] = alt;
                prev[edge.node] = curr;
                queue.push({ node: edge.node, dist: alt });
            }
        });
    }
    return { visited: visitedOrder, path: reconstructPath(prev, start, target) };
}

function runBFS(start, target) {
    const visited = new Set([start]); const prev = {}; const visitedOrder = []; const queue = [start];
    while (queue.length > 0) {
        const curr = queue.shift();
        visitedOrder.push(curr);
        if (curr === target) break;

        (graphData.nodes[curr] || []).forEach(edge => {
            if (!visited.has(edge.node)) {
                visited.add(edge.node);
                prev[edge.node] = curr;
                queue.push(edge.node);
            }
        });
    }
    return { visited: visitedOrder, path: reconstructPath(prev, start, target) };
}

function runAStar(start, target) {
    const distances = {}; const prev = {}; const visitedOrder = []; const queue = [];
    const [tx, ty] = parseCoords(target);
    
    const h = (nodeKey) => { 
        const [nx, ny] = parseCoords(nodeKey); 
        return Math.hypot(nx - tx, ny - ty); 
    };

    Object.keys(graphData.nodes).forEach(n => distances[n] = Infinity);
    distances[start] = 0;
    queue.push({ node: start, g: 0, f: h(start) });

    while (queue.length > 0) {
        queue.sort((a, b) => a.f - b.f);
        const { node: curr, g: currG } = queue.shift();

        if (currG > distances[curr]) continue;
        if (!visitedOrder.includes(curr)) visitedOrder.push(curr);
        if (curr === target) break;

        (graphData.nodes[curr] || []).forEach(edge => {
            const altG = currG + edge.weight;
            if (altG < distances[edge.node]) {
                distances[edge.node] = altG; 
                prev[edge.node] = curr;
                queue.push({ node: edge.node, g: altG, f: altG + h(edge.node) });
            }
        });
    }
    return { visited: visitedOrder, path: reconstructPath(prev, start, target) };
}

function reconstructPath(prev, start, target) {
    const path = []; let curr = target;
    if (prev[curr] || curr === start) {
        while (curr) { path.unshift(curr); curr = prev[curr]; }
    }
    return path;
}

function calculateTotalPathWeight(path) {
    if (!path || path.length < 2) return 0;
    let sum = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i]; const v = path[i+1];
        const edge = graphData.nodes[u]?.find(e => e.node === v);
        if (edge) sum += edge.weight;
    }
    return sum;
}

// Playback Recording Timeline Controller
function setupStepControls() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const resetBtn = document.getElementById('stepResetBtn');
    const timelineSlider = document.getElementById('timelineSlider');
    const indicator = document.getElementById('stepIndicator');
    const totalVisitedCount = document.getElementById('totalVisitedCount');
    const totalPathWeightField = document.getElementById('totalPathWeight');

    let isPlaying = false; let playbackInterval = null; const speedMs = 15; 

    function updateStepUI() {
        indicator.textContent = `${currentStep} / ${totalSteps}`;
        timelineSlider.value = currentStep;
        drawNetwork();
    }

    function play() {
        if (currentStep >= totalSteps) currentStep = 0;
        isPlaying = true;
        playPauseBtn.textContent = '⏸ Pause';
        playbackInterval = setInterval(() => {
            if (currentStep < totalSteps) {
                currentStep++;
                updateStepUI();
            } else {
                pause();
            }
        }, speedMs);
    }

    function pause() {
        isPlaying = false;
        playPauseBtn.textContent = '▶ Play';
        clearInterval(playbackInterval);
    }

    playPauseBtn.addEventListener('click', () => {
        if (isPlaying) pause();
        else play();
    });

    resetBtn.addEventListener('click', () => {
        pause(); currentStep = 0; updateStepUI();
    });

    timelineSlider.addEventListener('input', (e) => {
        pause(); currentStep = parseInt(e.target.value, 10); updateStepUI();
    });

    window.initStepTimeline = function(data) {
        pause(); stepsData = data; currentStep = 0; totalSteps = data.visited.length;
        totalVisitedCount.textContent = totalSteps;
        totalPathWeightField.textContent = data.path.length > 0 ? calculateTotalPathWeight(data.path) : "Unreachable";
        timelineSlider.max = totalSteps; timelineSlider.value = 0;
        timelineSlider.disabled = totalSteps === 0; playPauseBtn.disabled = totalSteps === 0;
        updateStepUI(); play(); 
    };
    
    window.clearStepTimeline = function() {
        pause(); stepsData = { visited: [], path: [] }; currentStep = 0; totalSteps = 0;
        totalVisitedCount.textContent = '0'; totalPathWeightField.textContent = '0';
        timelineSlider.max = 0; timelineSlider.value = 0;
        timelineSlider.disabled = true; playPauseBtn.disabled = true;
        updateStepUI();
    };
}

// Context Menu & Selection Handlers
function setupContextMenu() {
    contextMenu.innerHTML = `
        <div class="menu-item" id="setStartOpt">📍 Set as Starting Point</div>
        <div class="menu-item" id="setDestOpt">🏁 Set as Destination Point</div>
    `;

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const targetNode = getClosestNode(e.clientX - rect.left, e.clientY - rect.top);

        if (targetNode) {
            selectedNodeFromContext = targetNode;
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.style.display = 'block';
        } else {
            contextMenu.style.display = 'none';
        }
    });

    document.addEventListener('click', () => contextMenu.style.display = 'none');

    contextMenu.addEventListener('click', (e) => {
        if (!selectedNodeFromContext) return;
        window.clearStepTimeline();

        if (e.target.id === 'setStartOpt') {
            if (selectedNodeFromContext === destinationNodeKey) return showToast("Cannot mirror nodes!");
            startNodeKey = selectedNodeFromContext;
            document.getElementById('startNodeInput').value = startNodeKey;
        } else if (e.target.id === 'setDestOpt') {
            if (selectedNodeFromContext === startNodeKey) return showToast("Cannot mirror nodes!");
            destinationNodeKey = selectedNodeFromContext;
            document.getElementById('destinationNodeInput').value = destinationNodeKey;
        }
        drawNetwork();
    });
}

function setupInputControls() {
    document.getElementById('clearStartBtn').addEventListener('click', () => {
        startNodeKey = null; document.getElementById('startNodeInput').value = '';
        window.clearStepTimeline(); drawNetwork();
    });
    document.getElementById('clearDestBtn').addEventListener('click', () => {
        destinationNodeKey = null; document.getElementById('destinationNodeInput').value = '';
        window.clearStepTimeline(); drawNetwork();
    });
    document.getElementById('generateBtn').addEventListener('click', () => {
        const count = parseInt(document.getElementById('nodeCountInput').value, 10);
        if (isNaN(count) || count < 10) return showToast("Specify at least 10 nodes.");
        generateProceduralGraph(count);
    });
    // document.getElementById('saveMapBtn').addEventListener('click', saveGraphToFile);

    document.getElementById('mapPresetSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            switchMapPreset(e.target.value);
        }
    });
}

// System Initialization Bootstrapping
function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawNetwork();
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg; toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3500);
}

async function init() {
    resizeCanvas();
    setupInteractions();
    setupContextMenu();
    setupInputControls();
    setupStepControls();
    window.addEventListener('resize', resizeCanvas);

    // Initial switch to Surabaya default state
    await switchMapPreset('surabaya');

    document.getElementById('startBtn').addEventListener('click', () => {
        if (!startNodeKey || !destinationNodeKey) return showToast("Pick starting and destination points.");
        
        const algo = document.getElementById('algorithmSelect').value;
        let results;
        if (algo === 'dijkstra') results = runDijkstra(startNodeKey, destinationNodeKey);
        else if (algo === 'bfs') results = runBFS(startNodeKey, destinationNodeKey);
        else if (algo === 'astar') results = runAStar(startNodeKey, destinationNodeKey);
        
        if (!results || results.path.length === 0) return showToast("No valid route connects these locations.");
        window.initStepTimeline(results);
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        const activePreset = document.getElementById('mapPresetSelect').value;
        if (activePreset) {
            switchMapPreset(activePreset);
        } else {
            startNodeKey = null; destinationNodeKey = null;
            transform = { scale: 1, offsetX: 0, offsetY: 0 };
            document.getElementById('startNodeInput').value = '';
            document.getElementById('destinationNodeInput').value = '';
            window.clearStepTimeline();
            calculateBounds();
            drawNetwork();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
