"""Merge multiple section keys in a class-*.json into a single section."""
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
new_section_name = sys.argv[2]
data = json.load(open(src, encoding='utf-8'))
inner = list(data.values())[0]
classes = {}
explanations = []
for sec_name, sec_block in inner.items():
    if not isinstance(sec_block, dict):
        continue
    if sec_block.get('explanation'):
        explanations.append(sec_block['explanation'])
    for cls_name, cls_meta in sec_block.get('classes', {}).items():
        existing = classes.setdefault(cls_name, {
            'description': '',
            'methods': {},
        })
        if not existing['description'] and cls_meta.get('description'):
            existing['description'] = cls_meta['description']
        # Merge methods - prefer longer / richer descriptions
        for sig, desc in (cls_meta.get('methods') or {}).items():
            if sig not in existing['methods']:
                existing['methods'][sig] = desc
            elif len(desc) > len(existing['methods'][sig]):
                existing['methods'][sig] = desc

merged = {
    'explanation': ' '.join(explanations),
    'classes': classes,
}
out = {list(data.keys())[0]: {new_section_name: merged}}
json.dump(out, open(src, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(f'Merged {len(inner)} sections -> 1 section "{new_section_name}"')
print(f'Total classes: {len(classes)}')
print(f'Total methods: {sum(len(c["methods"]) for c in classes.values())}')