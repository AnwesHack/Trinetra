import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const checkHealth = async () => {
    const res = await axios.get(`${BASE}/health`);
    return res.data;
};

export const uploadBlueprint = async (file) => {
    const form = new FormData();
    form.append("file", file);

    const res = await axios.post(
        `${BASE}/process-blueprint`,
        form,
        {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 30000
        }
    );
    return res.data;
    // { walls:[...], count:N, image_width:W, image_height:H }
};