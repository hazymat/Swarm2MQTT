# Saves release download counts to the stats branch (checked out in the folder given as the only argument).
# releases.json: every release's asset counts, kept after a release is deleted. downloads.csv: one row per day from the first run (installs weren't counted apart before), rewritten through the day.
# people = downloads of the -install.tar.gz copy, which only fresh installs fetch (install.sh); updates = the plain .tar.gz, fetched by updates.
import csv, datetime, json, os, sys, urllib.request
stats_dir, repo = sys.argv[1], os.environ['GITHUB_REPOSITORY']
releases_path, csv_path = os.path.join(stats_dir, 'releases.json'), os.path.join(stats_dir, 'downloads.csv')
today = datetime.datetime.now(datetime.timezone.utc).date()

def fetch_releases():
    found, page = [], 1
    while True:
        request = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases?per_page=100&page={page}', headers={'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN']})
        with urllib.request.urlopen(request, timeout=60) as response: batch = json.load(response)
        if not batch: return found
        found += batch; page += 1

saved = json.load(open(releases_path)) if os.path.exists(releases_path) else {}
live = fetch_releases()
if not live: sys.exit('GitHub returned no releases; nothing saved')
for release in live:
    entry = saved.setdefault(release['tag_name'], {'assets': {}})
    entry['published'], entry['prerelease'] = release['published_at'] or release['created_at'], release['prerelease']
    entry.pop('deleted', None)
    for asset in release['assets']: entry['assets'][asset['name']] = max(asset['download_count'], entry['assets'].get(asset['name'], 0))
live_tags = {release['tag_name'] for release in live}
for tag, entry in saved.items():
    if tag not in live_tags: entry.setdefault('deleted', today.isoformat())

is_install = lambda name: name.endswith('-install.tar.gz')
is_update = lambda name: name.endswith('.tar.gz') and not is_install(name)
def people(entry): return sum(count for name, count in entry['assets'].items() if is_install(name))

installers = sum(people(entry) for entry in saved.values())
updates = sum(count for entry in saved.values() for name, count in entry['assets'].items() if is_update(name))
row = {'date': today.isoformat(), 'people': installers, 'installers': installers, 'updates': updates, 'releases': len(saved), 'estimated': 0}
fields = list(row)
rows = list(csv.DictReader(open(csv_path))) if os.path.exists(csv_path) else []
rows = [existing for existing in rows if existing['date'] != row['date']] + [row]
json.dump(saved, open(releases_path, 'w'), indent=1, sort_keys=True)
with open(csv_path, 'w', newline='') as file: writer = csv.DictWriter(file, fields, lineterminator='\n'); writer.writeheader(); writer.writerows(rows)
print(row)
