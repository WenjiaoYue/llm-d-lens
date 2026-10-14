import { useEffect, useState } from 'react';
export function useHardwareProfiles(getHardwareProfiles) {
    const [profiles, setProfiles] = useState([]);
    useEffect(() => {
        const controller = new AbortController();
        getHardwareProfiles({ signal: controller.signal }).then(payload => {
            if (!controller.signal.aborted) setProfiles(payload.profiles || []);
        }).catch(() => {});
        return () => controller.abort();
    }, [getHardwareProfiles]);
    return profiles;
}
