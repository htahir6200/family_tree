"""
Add English names (name_en) for tree nodes that only have Urdu names.
Run: python fill_missing_en.py && python sync_tree.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / "master_tree.json"

# Verified transliterations for nodes added without English (by id).
ID_TO_EN = {
    "__mehr_afzal": "Muhammad Mahfuz",
    "child_mehr_afzal": "Farhan",
    "__mehr_afz_1": "Furqan ul Haq",
    "child_mehr_afz_1": "Kamran",
    "__noor_zaman_k": "Muhammad Asif",
    "child___noor_zaman": "Abdullah",
    "child___noor_z_5": "Ahsan",
    "__noor_zam_1": "Muhammad Afzal",
    "child___noor_zam_1": "Rehan",
    "child___noor_z_1": "Uman",
    "child___noor_z_2": "Ehsan",
    "child___noor_z_3": "Adnan",
    "child___noor_z_4": "Noman",
    "child_mast_rehman": "Abid",
    "child_mast_reh_1": "Adil",
    "child_mast_reh_2": "Adeel",
    "child_gulzar": "Mohsin",
    "__bashir_muham": "Muhammad Ilyas",
    "__ilyas_muhamm": "Parvez Akhtar",
    "__ilyas_mu_1": "Muhammad Javed",
    "child_ilyas_muhamm": "Aurangzeb",
    "__ilyas_mu_2": "Shakeel Ahmad",
    "__mehr_saleem": "Danish Mahmood",
    "child_mehr_saleem": "Tauseef",
    "__fazal_rehman": "Parvez Akhtar",
    "____fazal_rehm": "Tahir Abbas",
    "____fazal__1": "Hassan Ali",
    "____fazal__2": "Hussain Ali",
    "child___fazal_rehm": "Muhammad Bilal",
    "__fazal_re_1": "Muhammad Arshad",
    "child___fazal_re_1": "Muneeb",
    "child___fazal__1": "Abdullah",
    "__khilqat_rehm": "Muhammad Javed",
    "__khilqat__1": "Shan Zeb",
    "child___khilqat__1": "Nazuk",
    "child___khilqa_1": "Hammad",
    "child___khilqa_2": "Daniyal",
    "child___khilqa_3": "Zulnoorain",
    "child_khilqat_rehm": "Khanwaiz",
    "child_child_khilqa": "Moeez",
    "child_child_kh_1": "Usman",
    "child_child_kh_2": "Umar",
    "__child_khilqa": "Abdul Hadi",
    "__shaukat_mehm": "Muhammad Arslan",
    "child_shaukat_mehm": "Mujtaba",
    "__shaukat__1": "Muhammad Irfan",
    "child_mehr_yusuf_g": "Abdul Salam",
    "child_child_mehr_y": "Adnan",
    "child_child_me_1": "Noman",
    "__child_mehr_y": "Saifullah",
    "__mehr_yusuf_g": "Hafeez ur Rehman",
    "__bakhtawar": "Unknown",
    "child_bakhtawar": "Mitha",
}

# Urdu phrase -> English for nodes matched by normalized Urdu text.
URDU_TO_EN = {
    "معلوم نہیں": "Unknown",
    "محمد محفوظ": "Muhammad Mahfuz",
    "فرحان": "Farhan",
    "فرقان الحق": "Furqan ul Haq",
    "کامران": "Kamran",
    "محمد آصف": "Muhammad Asif",
    "عبداللہ": "Abdullah",
    "احسن": "Ahsan",
    "محمد افضل": "Muhammad Afzal",
    "ریحان": "Rehan",
    "عمان": "Uman",
    "احسان": "Ehsan",
    "عدنان": "Adnan",
    "نعمان": "Noman",
    "عابد": "Abid",
    "عادل": "Adil",
    "عدیل": "Adeel",
    "محسن": "Mohsin",
    "محمد الیاس": "Muhammad Ilyas",
    "پرویز اختر": "Parvez Akhtar",
    "محمد جاوید": "Muhammad Javed",
    "اورنگزیب": "Aurangzeb",
    "شکیل احمد": "Shakeel Ahmad",
    "دانش محمود": "Danish Mahmood",
    "توصیف": "Tauseef",
    "طاہر عباس": "Tahir Abbas",
    "حسن علی": "Hassan Ali",
    "حسین علی": "Hussain Ali",
    "محمدبلال": "Muhammad Bilal",
    "محمد ارشاد": "Muhammad Arshad",
    "منیب": "Muneeb",
    "چن زیب": "Shan Zeb",
    "نازک": "Nazuk",
    "حماد": "Hammad",
    "دانیال": "Daniyal",
    "ذوالنورین": "Zulnoorain",
    "خانویز": "Khanwaiz",
    "معز": "Moeez",
    "عثمان": "Usman",
    "عمر": "Umar",
    "عبد الہادی": "Abdul Hadi",
    "محمد ارسلان": "Muhammad Arslan",
    "مجتبیٰ": "Mujtaba",
    "محمد عرفان": "Muhammad Irfan",
    "عبدالسلام": "Abdul Salam",
    "سیف اللہ": "Saifullah",
    "حفیظ الرحمن": "Hafeez ur Rehman",
    "مٹھا": "Mitha",
}


def normalize_urdu(s: str) -> str:
    return re.sub(r"[\u0640\u200c\u200d\ufeff\s]+", "", str(s or "")).strip()


def english_for(node: dict) -> str | None:
    node_id = node.get("id", "")
    if node_id in ID_TO_EN:
        return ID_TO_EN[node_id]

    urdu = (node.get("name_urdu") or "").strip()
    if urdu in URDU_TO_EN:
        return URDU_TO_EN[urdu]

    key = normalize_urdu(urdu)
    for k, v in URDU_TO_EN.items():
        if normalize_urdu(k) == key:
            return v
    return None


def fill(node: dict, filled: list) -> None:
    en = (node.get("name_en") or "").strip()
    if not en:
        guess = english_for(node)
        if guess:
            node["name_en"] = guess
            filled.append((node["id"], node.get("name_urdu", ""), guess))
        else:
            filled.append((node["id"], node.get("name_urdu", ""), None))
    for ch in node.get("children") or []:
        fill(ch, filled)


def main() -> None:
    with open(SOURCE, encoding="utf-8") as f:
        payload = json.load(f)

    filled: list[tuple[str, str, str | None]] = []
    fill(payload["tree"], filled)

    added = [x for x in filled if x[2]]
    still_missing = [x for x in filled if not x[2]]

    with open(SOURCE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Added name_en for {len(added)} persons")
    for pid, urdu, en in added:
        print(f"  {pid}: {en}")

    if still_missing:
        print(f"\nStill missing ({len(still_missing)}):")
        for pid, urdu, _ in still_missing:
            print(f"  {pid}: {urdu!r}")


if __name__ == "__main__":
    main()
