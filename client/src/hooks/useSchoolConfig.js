import { useCallback, useEffect, useState } from "react";
import api from "../services/api.js";

// Any authenticated role can call GET /api/school/config — it's the same
// classes/sectionsByClass/subjects data the admin maintains, reused here so
// Teacher and Admin forms can offer dropdowns instead of free text.
// Returns [config, refetch] since admin screens that edit this data need to
// refresh it immediately after a change.
export function useSchoolConfig() {
  const [config, setConfig] = useState({ classes: [], sectionsByClass: {}, subjects: [] });

  const refetch = useCallback(() => {
    return api
      .get("/school/config")
      .then((res) => setConfig(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [config, refetch];
}
