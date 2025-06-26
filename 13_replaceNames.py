toDo = {
    "EG      (3. Flur)": "EG",
    "OG 01 (4. Flur)": "OG 01",
    "OG 02 (5. Flur)": "OG 02",
    "OG 03 (6. Flur)": "OG 03",
    "OG 04 (7. Flur)": "OG 04",
    "OG 05 (8. Flur)": "OG 05",
}

import os


def searchInFolder(path):
    for root, dirs, files in os.walk(path):
        for file in files:
            if file.endswith(".json"):
                with open(os.path.join(root, file), "r", encoding="utf-8") as f:
                    content = f.read()
                    for k in toDo.keys():
                        if k in content:
                            print(f"Replacing '{k}' in {os.path.join(root, file)}")
                            content = content.replace(k, toDo[k])
                            with open(
                                os.path.join(root, file), "w", encoding="utf-8"
                            ) as f:
                                f.write(content)


searchInFolder(os.getcwd() + "/data/")  # search in the data folder
