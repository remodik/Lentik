"""Интерактивные компоненты сообщений (Phase 3): кнопки и select-меню.

Строгая валидация — чтобы бот не прислал кривое/гигантское дерево. Хранится в
`messages.components` как список action-row.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, model_validator

ButtonStyle = Literal["primary", "secondary", "danger"]


class ButtonComponent(BaseModel):
    type: Literal["button"] = "button"
    custom_id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=80)
    style: ButtonStyle = "secondary"
    disabled: bool = False


class SelectOption(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=100)


class SelectComponent(BaseModel):
    type: Literal["select"] = "select"
    custom_id: str = Field(min_length=1, max_length=100)
    placeholder: str | None = Field(default=None, max_length=120)
    options: list[SelectOption] = Field(min_length=1, max_length=25)
    min_values: int = Field(default=1, ge=0, le=25)
    max_values: int = Field(default=1, ge=1, le=25)
    disabled: bool = False

    @model_validator(mode="after")
    def _check_minmax(self) -> "SelectComponent":
        if self.min_values > self.max_values:
            raise ValueError("min_values must be <= max_values")
        if self.max_values > len(self.options):
            raise ValueError("max_values must be <= number of options")
        return self


RowChild = Annotated[
    Union[ButtonComponent, SelectComponent],
    Field(discriminator="type"),
]


class ActionRow(BaseModel):
    type: Literal["row"] = "row"
    components: list[RowChild] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def _check_row(self) -> "ActionRow":
        selects = [c for c in self.components if isinstance(c, SelectComponent)]
        if selects and len(self.components) != 1:
            raise ValueError("a select must be the only component in its row")
        return self


def dump_components(rows: list[ActionRow] | None) -> list[dict]:
    return [r.model_dump() for r in rows] if rows else []


def has_component(components: list[dict] | None, custom_id: str, ctype: str) -> bool:
    """Есть ли в сохранённых компонентах элемент с таким custom_id и типом."""
    for row in components or []:
        for c in row.get("components", []):
            if c.get("type") == ctype and c.get("custom_id") == custom_id:
                return True
    return False


# ── Интеракции ───────────────────────────────────────────────────────────────


class InteractionRequest(BaseModel):
    """Человек кликнул кнопку / выбрал в select."""

    custom_id: str = Field(min_length=1, max_length=100)
    type: Literal["button", "select"]
    values: list[str] | None = Field(default=None, max_length=25)


class InteractionCreatedResponse(BaseModel):
    interaction_id: str


# ── Модалки (Phase 3b) ───────────────────────────────────────────────────────

ModalInputStyle = Literal["short", "paragraph"]


class ModalTextInput(BaseModel):
    custom_id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=80)
    style: ModalInputStyle = "short"
    placeholder: str | None = Field(default=None, max_length=120)
    value: str | None = Field(default=None, max_length=4000)
    required: bool = True
    max_length: int = Field(default=4000, ge=1, le=4000)


class ModalSpec(BaseModel):
    """Форма, которую бот просит человека заполнить (аналог Discord modal)."""

    custom_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=80)
    inputs: list[ModalTextInput] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def _unique_input_ids(self) -> "ModalSpec":
        ids = [i.custom_id for i in self.inputs]
        if len(ids) != len(set(ids)):
            raise ValueError("input custom_id must be unique within a modal")
        return self


class ModalSubmitRequest(BaseModel):
    """Значения полей формы, введённые человеком."""

    values: dict[str, str]

    @model_validator(mode="after")
    def _validate_values(self) -> "ModalSubmitRequest":
        if len(self.values) > 5:
            raise ValueError("too many fields")
        for k, v in self.values.items():
            if not k or len(k) > 100:
                raise ValueError("invalid field id")
            if len(v) > 4000:
                raise ValueError("field value too long (max 4000)")
        return self


class BotInteractionResponse(BaseModel):
    """Ответ бота на интеракцию."""

    type: Literal["update_message", "message", "ack", "modal"]
    text: str | None = Field(default=None, max_length=4000)
    components: list[ActionRow] | None = Field(default=None, max_length=5)
    # ephemeral: сообщение видно только кликнувшему — валидно только с
    # type="message" (нельзя сделать приватным уже существующее для всех
    # сообщение через update_message).
    ephemeral: bool = False
    # Обязателен при type="modal".
    modal: ModalSpec | None = None

    @model_validator(mode="after")
    def _check(self) -> "BotInteractionResponse":
        if self.type == "modal" and self.modal is None:
            raise ValueError("modal is required for type='modal'")
        if self.ephemeral and self.type != "message":
            raise ValueError("ephemeral is only valid for type='message'")
        return self
