import { useEffect, useState } from "react";
import { usersApi, websitesApi } from "./api";
import type { AppUser, Website } from "./types";

export function useWebsites() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    websitesApi
      .list()
      .then(setWebsites)
      .finally(() => setLoading(false));
  }, []);

  return { websites, loading, reload: () => websitesApi.list().then(setWebsites) };
}

export function useUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi
      .list()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return { users, loading, reload: () => usersApi.list().then(setUsers) };
}
