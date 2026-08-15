from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


out_dir = Path("outputs/report7-final")
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "foodresq_test_case_report_pie_chart.png"

width, height = 760, 420
image = Image.new("RGB", (width, height), "white")
draw = ImageDraw.Draw(image)

try:
    title_font = ImageFont.truetype("times.ttf", 30)
    label_font = ImageFont.truetype("times.ttf", 18)
    percent_font = ImageFont.truetype("arialbd.ttf", 23)
except OSError:
    title_font = ImageFont.load_default()
    label_font = ImageFont.load_default()
    percent_font = ImageFont.load_default()

title = "Passed Percent"
title_box = draw.textbbox((0, 0), title, font=title_font)
draw.text(((width - (title_box[2] - title_box[0])) / 2, 28), title, fill="#666666", font=title_font)

pie_box = (150, 105, 430, 385)
passed_color = "#f79646"
draw.pieslice(pie_box, start=0, end=360, fill=passed_color, outline="white", width=2)

# Small radial white separator, matching the reference chart.
cx = (pie_box[0] + pie_box[2]) // 2
cy = (pie_box[1] + pie_box[3]) // 2
draw.line((cx, pie_box[1] + 4, cx, cy), fill="white", width=4)

percent = "100%"
percent_box = draw.textbbox((0, 0), percent, font=percent_font)
draw.text(
    (cx - (percent_box[2] - percent_box[0]) / 2, cy + 36),
    percent,
    fill="white",
    font=percent_font,
)

legend = [
    ("Passed", passed_color),
    ("Failed", "#4bacc6"),
    ("Pending", "#8064a2"),
    ("N/A", "#d9d9d9"),
]
legend_x, legend_y = 505, 177
for index, (label, color) in enumerate(legend):
    y = legend_y + index * 30
    draw.rectangle((legend_x, y + 4, legend_x + 16, y + 20), fill=color, outline="#eeeeee")
    draw.text((legend_x + 24, y), label, fill="#333333", font=label_font)

draw.rectangle((75, 65, 685, 405), outline="#e6e6e6", width=1)
image.save(out_path)
print(out_path.resolve())
