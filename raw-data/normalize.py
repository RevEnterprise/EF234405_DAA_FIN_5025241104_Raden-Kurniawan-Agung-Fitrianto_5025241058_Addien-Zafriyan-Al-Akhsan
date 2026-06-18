import json
import math

with open('input.geojson', 'r') as f:
    data = json.load(f)

# Normalize coordinates to 0-1000
coords_flat = [coord for feat in data['features'] for coord in feat['geometry']['coordinates']]
min_lon = min(c[0] for c in coords_flat); max_lon = max(c[0] for c in coords_flat)
min_lat = min(c[1] for c in coords_flat); max_lat = max(c[1] for c in coords_flat)

width, height = max_lon - min_lon, max_lat - min_lat
graph = {} # Adjacency List

# add counter
counter = 0

for feature in data['features']:
    coords = feature['geometry']['coordinates']
    for i in range(len(coords) - 1):
        counter += 1
        # Scale
        p1 = [((coords[i][0] - min_lon) / width) * 1000, 1000 - ((coords[i][1] - min_lat) / height) * 1000]
        p2 = [((coords[i+1][0] - min_lon) / width) * 1000, 1000 - ((coords[i+1][1] - min_lat) / height) * 1000]
        
        # Build graph (using string keys to identify unique intersections)
        key1, key2 = str(p1), str(p2)
        dist = math.dist(p1, p2)
        
        if key1 not in graph: graph[key1] = []
        graph[key1].append({"node": key2, "weight": dist})
        
        # If not one-way, add reverse edge
        if feature['properties'].get('oneway') != 'yes':
            if key2 not in graph: graph[key2] = []
            graph[key2].append({"node": key1, "weight": dist})

# Save output
with open('graph_data.json', 'w') as f:
    json.dump({"nodes": graph}, f, indent=2)

print(counter)
