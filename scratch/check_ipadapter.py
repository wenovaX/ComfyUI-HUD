import folder_paths
import os

def find_ipadapter_info():
    print("--- ComfyUI IPAdapter Info Search ---")
    
    # 1. IPAdapter 모델 경로 확인
    try:
        ipadapter_paths = folder_paths.get_filename_list("ipadapter")
        print(f"IPAdapter Models found: {len(ipadapter_paths)}")
        for path in ipadapter_paths[:5]: # 상위 5개만 출력
            print(f"  - {path}")
    except Exception as e:
        print(f"Error finding ipadapter paths: {e}")

    # 2. CLIP Vision 모델 경로 확인 (IPAdapter에 필수)
    try:
        clip_vision_paths = folder_paths.get_filename_list("clip_vision")
        print(f"CLIP Vision Models found: {len(clip_vision_paths)}")
    except:
        print("CLIP Vision paths not found.")

    # 3. 관련 폴더 위치 확인
    for folder in ["ipadapter", "clip_vision"]:
        try:
            paths = folder_paths.get_folder_paths(folder)
            print(f"Folder paths for {folder}: {paths}")
        except: pass

if __name__ == "__main__":
    find_ipadapter_info()
