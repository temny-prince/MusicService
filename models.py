from dataclasses import dataclass, field, asdict
from typing import List, Optional

@dataclass
class Track:
    id: str
    title: str
    artist: str
    cover_uri: Optional[str] = None  # Ссылка на обложку (URI Яндекса)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        return cls(**data)

@dataclass
class Playlist:
    id: str
    name: str
    tracks: List[Track] = field(default_factory=list)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "tracks": [t.to_dict() for t in self.tracks]
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            id=data["id"],
            name=data["name"],
            tracks=[Track.from_dict(t) for t in data.get("tracks", [])]
        )