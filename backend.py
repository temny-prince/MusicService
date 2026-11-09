import os
import json
from typing import List
from yandex_music import Client
from models import Track, Playlist

TOKEN_FILE = 'token.txt'
PLAYLISTS_FILE = 'playlists.json'


class MusicBackend:
    def __init__(self):
        self.client = None
        self.playlists: List[Playlist] = []
        self._load_token()
        self._load_playlists()

    def _load_token(self):
        if not os.path.exists(TOKEN_FILE):
            raise FileNotFoundError(f"Файл {TOKEN_FILE} не найден.")
        with open(TOKEN_FILE, 'r') as f:
            token = f.read().strip()
        if not token:
            raise ValueError(f"Файл {TOKEN_FILE} пуст.")
        self.client = Client(token).init()

    def _load_playlists(self):
        if os.path.exists(PLAYLISTS_FILE):
            with open(PLAYLISTS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.playlists = [Playlist.from_dict(p) for p in data]

    def _save_playlists(self):
        with open(PLAYLISTS_FILE, 'w', encoding='utf-8') as f:
            json.dump([p.to_dict() for p in self.playlists], f, ensure_ascii=False, indent=4)

    def search_tracks(self, query: str) -> List[Track]:
        """Ищет треки и возвращает список моделей Track с обложками."""
        try:
            result = self.client.search(query)
            if not result.tracks or not result.tracks.results:
                return []

            tracks = []
            for short_track in result.tracks.results:
                # Пытаемся получить полную информацию о треке.
                # В новых версиях библиотеки поиск может сразу возвращать полные объекты,
                # либо мы получаем их через клиент по ID.
                try:
                    full_track = self.client.tracks([short_track.id])[0]
                except Exception:
                    full_track = short_track

                # Пытаемся получить URL обложки
                cover_url = None
                try:
                    if hasattr(full_track, 'get_cover_url'):
                        cover_url = full_track.get_cover_url(size='100x100')
                    elif full_track.albums and full_track.albums[0].cover_uri:
                        cover_uri = full_track.albums[0].cover_uri
                        cover_url = cover_uri.replace("%%", "100x100")
                except Exception:
                    pass  # Если не удалось получить обложку, не страшно

                artist_name = "Unknown"
                if full_track.artists:
                    artist_name = full_track.artists[0].name

                tracks.append(Track(
                    id=str(full_track.id),
                    title=full_track.title,
                    artist=artist_name,
                    cover_uri=cover_url  # Здесь теперь лежит готовый URL, а не URI
                ))
            return tracks
        except Exception as e:
            print(f"Backend search error: {e}")
            raise e

    def get_stream_url(self, track_id: str) -> str:
        """Возвращает прямую ссылку на аудиопоток."""
        info = self.client.tracks_download_info(track_id, get_direct_links=True)
        if not info:
            raise Exception("No stream available")
        return info[0].direct_link

    def get_playlists(self) -> List[Playlist]:
        return self.playlists

    def create_playlist(self, name: str) -> Playlist:
        new_id = str(len(self.playlists) + 1)
        new_pl = Playlist(id=new_id, name=name)
        self.playlists.append(new_pl)
        self._save_playlists()
        return new_pl

    def add_track_to_playlist(self, playlist_id: str, track: Track) -> bool:
        for pl in self.playlists:
            if pl.id == playlist_id:
                if not any(t.id == track.id for t in pl.tracks):
                    pl.tracks.append(track)
                    self._save_playlists()
                    return True
                return False
        return False

    def remove_track_from_playlist(self, playlist_id: str, track_id: str) -> bool:
        for pl in self.playlists:
            if pl.id == playlist_id:
                pl.tracks = [t for t in pl.tracks if t.id != track_id]
                self._save_playlists()
                return True
        return False

    def rename_playlist(self, playlist_id: str, new_name: str) -> bool:
        for pl in self.playlists:
            if pl.id == playlist_id:
                pl.name = new_name
                self._save_playlists()
                return True
        return False

    def delete_playlist(self, playlist_id: str) -> bool:
        initial_len = len(self.playlists)
        self.playlists = [p for p in self.playlists if p.id != playlist_id]
        if len(self.playlists) < initial_len:
            self._save_playlists()
            return True
        return False