interface IInfoRow {
    name: string;
    value: string;
    className: string;
}

interface IInputOptions {
    uuid?: string;
    classes: string[];
    label: string;
    labelName: string;
    type: string;
    value?: string;
}

interface IRow {
    id: string;
    value: string;
}

interface ISelectOptions {
    uuid?: string;
    classes: string[];
    label: string;
    labelName: string;
    mainOption: string;
    query?: IQueryOptions;
    value?: string;
}

interface IQueryOptions {
    url: string;
    method: string;
    body?: object;
    query?: Record<string, any>;
}

interface IPosition {
    id: string;
    drug: string;
    count: number;
}

interface IItemOptions {
    id: string;
    drug: string;
    count: number;
}

interface ICard {
    id: string;
    fullname: string;
    date: string;
    recipe: string;
    positions: string[];
}

async function clear(date: Date) {
    const curDate = date.toISOString().slice(0, 10);
    const result = await query('order', 'DELETE', undefined, {
        date: curDate,
    })
    if (!result.ok) {
        throw new Error(await result.text());
    }
}

async function skipDay() {
    const nowDate = new Date();
    const list = document.querySelector('.cards-list');
    const addButtons = list!.lastElementChild;
    list!.innerHTML = '';
    list!.appendChild(addButtons!);
    let add_amount = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
    const update = await query('drug', 'POST', {
        amount: add_amount
    })
    if (!update.ok) {
        throw new Error(await update.text());
    }
    await init(new Date(nowDate.getTime() + 24 * 60 * 60 * 1000));
}

function toggleModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        if (modal.classList.toggle('hidden')) {
            const content = modal.querySelector('.content');
            content!.innerHTML = '';

            const approveBtn = modal.querySelector('#approve');
            approveBtn!.remove();
        }
    }
}

async function query(url: string, method: string, body?: object, query?: Record<string, any>) {
    const request = await fetch(url + (query ? `?${new URLSearchParams(query).toString()}` : ''), {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!request.ok) {
        throw new Error(await request.text());
    }
    return request
}

function validateString(str: string | undefined) {
    return str && str.length > 0;
}

function addRow(element: Element, options: IInfoRow) {
    element.classList.add(options.className);

    let p = element.appendChild(document.createElement('p'));
    p.innerText = options.name;
    p.classList.add('title');

    p = element.appendChild(document.createElement('p'));
    p.innerText = options.value;

    return p;
}

function addInput(element: Element, options: IInputOptions) {
    const container = document.createElement('div');
    container.classList.add(...options.classes);

    const label = document.createElement('label');
    label.htmlFor = options.label + options.uuid;
    label.innerText = options.labelName;

    const input = document.createElement('input');
    input.type = options.type;
    if (input.type === 'date') {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
        const dd = String(today.getDate()).padStart(2, '0');
        const currentDate = `${yyyy}-${mm}-${dd}`;
        input.setAttribute('min', currentDate);
    }
    input.id = options.label + options.uuid;
    if (options.value) {
        input.value = options.value;
    }

    container.appendChild(label);
    container.appendChild(input);
    element.appendChild(container);

    return input;
}

function addSelect(element: Element, options: ISelectOptions) {
    const container = document.createElement('div');
    container.classList.add(...options.classes);

    const label = document.createElement('label');
    label.htmlFor = options.label + options.uuid;
    label.innerText = options.labelName;

    const select = document.createElement('select');
    select.id = options.label + options.uuid;

    const mainOption = document.createElement('option');
    mainOption.innerText = options.mainOption;
    mainOption.disabled = true;
    select.appendChild(mainOption);

    container.appendChild(label);
    container.appendChild(select);
    element.appendChild(container);

    return select;
}

async function addSelectSql(element: Element, options: ISelectOptions) {
    const select = addSelect(element, options);

    const result = await query(options.query!.url, options.query!.method, options.query!.body, options.query!.query);

    const rows: IRow[] = await result.json();
    for (const row of rows) {
        const option = document.createElement('option');
        option.innerText = row.value;
        option.value = row.id;
        select.appendChild(option);
        if (row.id === options.value) {
            option.selected = true;
        }
    }

    return select;
}

async function addItems(li: Element, listCont: Element, positionsIds: string[] | undefined) {
    if (positionsIds && positionsIds.length > 0) {
        let result: Response;
        let row: IPosition[];
        for (const positionId of positionsIds) {
            result = await query('position', 'GET', undefined, {id: positionId});
            row = await result.json();
            await addItem(li, listCont, row[0]);
        }
    }
}

async function validate(card: Element, value: string) {
    let result: any = await query('drug', 'GET', undefined, {id: value});
    result = await result.json();
    const recipe = result[0].recipe as boolean;
    const itemNameSelect = card.querySelector('.order-recipe select')! as HTMLSelectElement;
    return recipe ? itemNameSelect.value === value : true;
}

async function validateRecipe(card: Element) {
    const items = card.querySelectorAll('.list-item .item-name p:not(.title)');
    const positions: string[] = [];
    items.forEach(item => {
        positions.push(item.getAttribute('value')!);
    });
    const validation = await Promise.all(positions.map(position => validate(card, position)));
    return validation.some(value => !value);
}

async function addItem(li: Element, listCont: Element, options?: IItemOptions) {
    const listItem = document.createElement('div');
    listItem.classList.add('list-item');
    listItem.setAttribute('edited', 'false');
    if (!options) {
        listItem.classList.add('editable');
    } else {
        listItem.id = options.id;
    }

    const id = options ? options.id : crypto.randomUUID();
    const itemId = listItem.appendChild(document.createElement('div'));
    itemId.classList.add('item-id');
    itemId.innerHTML = `<p class="title">ID: ${id}</p>`;

    const itemName = listItem.appendChild(document.createElement('div'));
    itemName.classList.add('item-name');
    itemName.innerHTML = '<p class="title">Наименование:</p>';

    const itemNameSelect = await addSelectSql(itemName!, {
        classes: ['inp'],
        label: 'drug',
        labelName: '',
        mainOption: 'Препарат',
        query: {
            url: '/drug',
            method: 'GET'
        },
        value: options?.drug
    });
    itemNameSelect.addEventListener('change', () => {
        listItem.setAttribute('edited', 'true');
    });

    const itemNameP = itemName.appendChild(document.createElement('p'));
    if (options && options.drug) {
        itemNameP.innerText = itemNameSelect.selectedOptions[0].text;
    }
    itemNameP.setAttribute('value', itemNameSelect.value);
    const itemCount = listItem.appendChild(document.createElement('div'));
    itemCount.classList.add('item-count');
    itemCount.innerHTML = '<p class="title">Количество:</p>';

    const itemCountInput = addInput(itemCount, {
        uuid: id,
        classes: ['inp'],
        label: 'name',
        labelName: '',
        type: 'number'
    });
    itemCountInput.addEventListener('change', () => {
        listItem.setAttribute('edited', 'true');
    });

    const itemCountP = itemCount.appendChild(document.createElement('p'));
    if (options && options.count) {
        itemCountP.innerText = String(options.count);
        itemCountInput.value = String(options.count);
    }
    itemCountP.setAttribute('value', itemCountInput.value);

    const itemButtons = listItem.appendChild(document.createElement('div'));
    itemButtons.classList.add('item-buttons');

    const buttonEdit = itemButtons.appendChild(document.createElement('img')) as HTMLImageElement;
    buttonEdit.src = "../assets/edit.svg";
    buttonEdit.alt = "Edit";
    buttonEdit.addEventListener('click', () => {
        itemNameSelect.value = itemNameP.getAttribute('value')!;
        itemCountInput.value = itemCountP.getAttribute('value')!;

        listItem.classList.add('editable');

        buttonEdit.classList.toggle('hidden');
        buttonDelete.classList.toggle('hidden');
        buttonApprove.classList.toggle('hidden');
        buttonCancel.classList.toggle('hidden');
    });

    const buttonDelete = itemButtons.appendChild(document.createElement('img'));
    buttonDelete.src = "../assets/delete-button.svg";
    buttonDelete.alt = "Delete";
    buttonDelete.addEventListener('click', async () => {
        const card = listItem.parentElement!.parentElement!.parentElement!;
        await query('order', 'POST', {
            itemId: id,
            remove: true,
            drug: {
                amount: itemCountP.innerText,
            },
	    position: {
		remove: true,
		id: id
	   }
        }, {
            id: card.id,
	    positionId: id,
            drugId: itemNameP.getAttribute('value')
        });

        listItem.remove();
    });

    const buttonApprove = itemButtons.appendChild(document.createElement('img'));
    buttonApprove.src = "../assets/approve.png";
    buttonApprove.alt = "Approve";
    buttonApprove.addEventListener('click', async () => {
        const card = listItem.parentElement!.parentElement!.parentElement!;

        if (itemCountInput.value === '' || Number(itemCountInput.value) <= 0) {
            alert('Введите корректное количество');
            return;
        }

        if (!(await validate(card, itemNameSelect.value))) {
            alert('Невозможно добавить препарат, так как он требует рецепт');
            return;
        }
        let result: any = await query('drug', 'GET', undefined, {
            id: itemNameSelect.value
        });
        result = await result.json();
        const lastCount = +result[0].amount;
        if (listItem.getAttribute('edited') === 'true') {
            const uuid = listCont.parentElement!.parentElement!.id;
            if (listItem.id) {
                const amount = +itemCountP.getAttribute('value')! - +itemCountInput.value;
                if (lastCount + amount < 0) {
                    alert('Не хватает товаров на складе');
                    return;
                }
                await query('position', 'POST', {
                    drugId: itemNameSelect.value,
                    count: itemCountInput.value,
                    drug: {
                        amount: amount,
                    }
                }, {
                    id: listItem.id,
                    drugId: itemNameSelect.value
                });

                // Проверка на то, хватает ли на складе препаратов (с учётом редактирования), если нет - return

            } else {

                if (lastCount - +itemCountInput.value < 0) {
                    alert('Не хватает товаров на складе');
                    return;
                }

                await query('order', 'POST', {
                    itemId: id,
                    position: {
                        id: id,
                        drug: itemNameSelect.value,
                        count: itemCountInput.value
                    },
                    drug: {
                        amount: +itemCountInput.value,
                        remove: true
                    }
                }, {
                    id: card.id,
                    positionId: id,
                    drugId: itemNameSelect.value
                });

            }

            itemCountP.innerText = itemCountInput.value;
            itemNameP.innerText = itemNameSelect.options[itemNameSelect.selectedIndex].text;

            itemNameP.setAttribute('value', itemNameSelect.value);
            itemCountP.setAttribute('value', itemCountInput.value);

            listItem.id = id;
            enableDragAndDropListItem(listItem);
        }

        listItem.classList.remove('editable');
        listItem.setAttribute('edited', 'false');


        buttonEdit.classList.toggle('hidden');
        buttonDelete.classList.toggle('hidden');
        buttonApprove.classList.toggle('hidden');
        buttonCancel.classList.toggle('hidden');
    });

    const buttonCancel = itemButtons.appendChild(document.createElement('img')) as HTMLImageElement;
    buttonCancel.src = "../assets/cancel.png";
    buttonCancel.alt = "Cancel";
    buttonCancel.addEventListener('click', () => {
        if (listItem.id) {
            listItem.classList.remove('editable');

            itemCountInput.value = itemCountP.getAttribute('value')!;
            itemNameSelect.value = itemNameP.getAttribute('value')!;

            buttonEdit.classList.toggle('hidden');
            buttonDelete.classList.toggle('hidden');
            buttonApprove.classList.toggle('hidden');
            buttonCancel.classList.toggle('hidden');
        } else {
            listItem.remove();
        }
    });

    if (options) {
        buttonApprove.classList.add('hidden');
        buttonCancel.classList.add('hidden');
    } else {
        buttonEdit.classList.add('hidden');
        buttonDelete.classList.add('hidden');
    }

    listCont.appendChild(listItem);
}

async function createListElement(options: ICard) {
    const list = document.querySelector('.cards-list');

    const li = document.createElement('li');
    li.classList.add('card');
    li.id = options.id

    const id = document.createElement('div');
    id.innerText = `ID: ${options.id}`;
    li.appendChild(id);

    const mainInfo = document.createElement('div');
    mainInfo.classList.add('main-info');

    let p = mainInfo.appendChild(document.createElement('p'));
    p.innerText = 'Основная информация';

    const buttonsMain = document.createElement('div');
    buttonsMain.classList.add('buttons');

    const buttonEdit = buttonsMain.appendChild(document.createElement('img'));
    buttonEdit.src = '../assets/edit.svg';
    buttonEdit.alt = 'edit';
    buttonEdit.addEventListener('click', () => {
        info.classList.toggle('editable');

        buttonEdit.classList.toggle('hidden');
        buttonApprove.classList.toggle('hidden');
        buttonCancel.classList.toggle('hidden');
    });

    const buttonApprove = buttonsMain.appendChild(document.createElement('img'));
    buttonApprove.src = '../assets/approve.png';
    buttonApprove.alt = 'edit';
    buttonApprove.classList.add('hidden');
    buttonApprove.addEventListener('click', async () => {
        if (!validateString(fullnameInput.value)) {
            alert('Введите ФИО');
            return;
        }
        if (await validateRecipe(li)) {
            alert('Некоторые препараты требуют рецепт');
            return;
        }
        if (info.getAttribute('edited') === 'true') {
            await query('order', 'POST', {
                fullname: fullnameInput.value,
                date: dateInput.value,
                recipe: recipeSelect.value
            }, {
                id: options.id
            });

            fullnameP.innerText = fullnameInput.value;
            dateP.innerText = dateInput.value;
            recipeP.innerText = recipeSelect.options[recipeSelect.selectedIndex].text;

            fullnameP.setAttribute('value', fullnameInput.value);
            dateP.setAttribute('value', dateInput.value);
            recipeP.setAttribute('value', recipeSelect.options[recipeSelect.selectedIndex].text);
        }

        info.setAttribute('edited', 'false');
        info.classList.toggle('editable');

        buttonEdit.classList.toggle('hidden');
        buttonApprove.classList.toggle('hidden');
        buttonCancel.classList.toggle('hidden');
    })

    const buttonCancel = buttonsMain.appendChild(document.createElement('img'));
    buttonCancel.src = '../assets/cancel.png';
    buttonCancel.alt = 'edit';
    buttonCancel.classList.add('hidden');
    buttonCancel.addEventListener('click', () => {
        info.classList.toggle('editable');

        if (info.getAttribute('edited') === 'true') {
            fullnameInput.value = fullnameP.getAttribute('value')!;
            dateInput.value = dateInput.getAttribute('value')!;
            recipeSelect.value = recipeSelect.getAttribute('value')!;
        }

        buttonEdit.classList.toggle('hidden');
        buttonApprove.classList.toggle('hidden');
        buttonCancel.classList.toggle('hidden');
    });
    mainInfo.appendChild(buttonsMain);

    li.appendChild(mainInfo);

    const info = document.createElement('div');
    info.classList.add('info');
    info.setAttribute('edited', 'false');

    const fullname = document.createElement('div');
    const fullnameP = addRow(fullname, {
        name: 'ФИО',
        value: options.fullname,
        className: 'order-fullname'
    });
    const fullnameInput = addInput(fullname, {
        uuid: options.id,
        classes: ['inp'],
        label: 'city',
        labelName: '',
        type: 'text',
        value: options.fullname
    });
    fullnameP.setAttribute('value', fullnameInput.value);
    fullnameInput.addEventListener('change', () => {
        info.setAttribute('edited', 'true');
    })
    info.appendChild(fullname);

    const date = document.createElement('div');
    const dateP = addRow(date, {
        name: 'Дата',
        value: options.date.slice(0, 10),
        className: 'order-date'
    });
    const dateInput = addInput(date!, {
        uuid: options.id,
        classes: ['inp'],
        label: 'date',
        labelName: '',
        type: 'date',
        value: options.date.slice(0, 10)
    });
    dateP.setAttribute('value', dateInput.value);
    dateInput.addEventListener('change', () => {
        info.setAttribute('edited', 'true');
    })
    info.appendChild(date);

    const recipe = document.createElement('div');
    const recipeP = addRow(recipe, {
        name: 'Рецепт',
        value: options.recipe,
        className: 'order-recipe'
    });
    const recipeSelect = await addSelectSql(recipe!, {
        uuid: options.id,
        classes: ['inp'],
        label: 'recipe',
        labelName: '',
        mainOption: 'Рецепт',
        query: {
            url: '/recipe',
            method: 'GET'
        },
        value: options.recipe
    });
    recipeP.setAttribute('value', recipeSelect.value);
    recipeP.innerText = recipeSelect.options[recipeSelect.selectedIndex].text;
    recipeSelect.addEventListener('change', () => {
        info.setAttribute('edited', 'true');
    })
    info.appendChild(recipe);

    li.appendChild(info);

    const cardList = li.appendChild(document.createElement('div'));
    cardList.classList.add('card-list');

    const cardListP = cardList.appendChild(document.createElement('p'));
    cardListP.innerHTML = 'Список препаратов:';

    const listCont = cardList.appendChild(document.createElement('div'));
    listCont.classList.add('list-cont');

    const addBtn = li.appendChild(document.createElement('button'));
    addBtn.classList.add('add-card-btn');
    addBtn.innerText = 'Добавить препарат';
    addBtn.addEventListener('click', () => {
        addItem(li, listCont);
    });

    const deleteBtn = li.appendChild(document.createElement('button'));
    deleteBtn.classList.add('delete-card-btn');
    deleteBtn.innerText = 'Удалить заказ';
    deleteBtn.addEventListener('click', async () => {
        await query('order', 'DELETE', undefined, {id: li.id});

        li.remove();
    });

    await addItems(li, listCont, options.positions);

    list!.insertBefore(li, list!.lastElementChild);

    return li;
}

async function addListElement() {
    const modal = document.querySelector('.modal');
    if (modal) {
        const content = modal.querySelector('.content');

        const fullname = addInput(content!, {
            classes: ['title'],
            label: 'fullname',
            labelName: 'ФИО',
            type: 'text'
        });

        const date = addInput(content!, {
            classes: ['title'],
            label: 'date',
            labelName: 'Дата',
            type: 'date'
        });

        const recipe = await addSelectSql(content!, {
            classes: ['title'],
            label: 'recipe',
            labelName: 'Рецепт',
            mainOption: 'Препарата',
            query: {
                url: '/recipe',
                method: 'GET'
            },
        });

        async function createNewListElement() {
            const uuid = crypto.randomUUID();

            const result = await query('recipe-id', 'GET', undefined, {value: recipe.options[recipe.selectedIndex].text});
            const recipe_id = await result.json();

            if (!validateString(fullname.value)) {
                alert('Поле ФИО должно быть заполнено');
                return;
            }

            if(!date.value) {
                alert('Необходимо ввести дату');
                return;
            }

            await query('/order', 'PUT', {
                id: uuid,
                fullname: fullname.value,
                date: date.value,
                recipe: recipe_id[0].id // Додонпа id
            });

            const li = await createListElement({
                id: uuid,
                recipe: recipe_id[0].id,
                fullname: fullname.value,
                date: date.value,
                positions: []
            })

            enableDragAndDropCard(li)
        }

        const modalButtons = modal.querySelector('.modal-buttons');

        const approveBtn = document.createElement('img');
        approveBtn.src = '../assets/approve.png';
        approveBtn.alt = 'Approve';
        approveBtn.id = 'approve';
        approveBtn.addEventListener('click', () => {
            try {
                createNewListElement();
                toggleModal();
            } catch (e: any) {
                window.alert(e.message);
            }
        });
        modalButtons!.insertBefore(approveBtn, modalButtons!.firstChild);

        toggleModal();
    }
}

function enableDragAndDropCard(card: HTMLElement) {
    card.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e: DragEvent) => {
        e.preventDefault();
        card.classList.remove('drag-over');

        const data = e.dataTransfer?.getData('text/plain');
        if (!data) return;

        const {itemId} = JSON.parse(data);
        const draggedItem = document.getElementById(itemId);
        const targetList = card.querySelector<HTMLElement>('.list-cont');

        const cardId = card.id;

        if (!cardId) return;

        const item = document.getElementById(itemId)!;

        if (!(await validate(card, (item.querySelector('.item-name select')! as HTMLSelectElement).value))) {
            alert('Невозможно добавить препарат, так как он требует рецепт');
            return;
        }

        const sourceCard = draggedItem!.closest('.card');
        const sourceCardId = sourceCard?.id;

        if (!targetList!.querySelector('.list-item')) {
            const placeholder = document.createElement('div');
            placeholder.classList.add('list-item-placeholder');
            targetList!.appendChild(placeholder);
        }

        if (sourceCardId) {
            await query('/order', 'POST', {
                itemId,
                remove: true
            }, {
                id: sourceCardId
            });
        }

        await query('/order', 'POST', {
            itemId,
        }, {
            id: cardId
        });

        targetList!.appendChild(draggedItem!);

        const placeholder = targetList!.querySelector('.list-item-placeholder');
        if (placeholder) placeholder.remove();

    });
}

function enableDragAndDropListItem(item: HTMLElement) {
    item.draggable = true;
    item.addEventListener('dragstart', (e: DragEvent) => {
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                itemId: item.id
            }));
        }
        item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
    });
}

function enableDragAndDrop() {
    const listItems = document.querySelectorAll<HTMLElement>('.list-item');
    listItems.forEach(enableDragAndDropListItem);

    const cards = document.querySelectorAll<HTMLElement>('.card');
    cards.forEach(enableDragAndDropCard);
}

async function createDestination() {
    const modal = document.querySelector('.modal');
    if (modal) {
        const content = modal.querySelector('.content');

        const id = crypto.randomUUID();
        const idCont = document.createElement('div');
        idCont.innerHTML = `<p>ID: ${id}</p>`;
        content!.appendChild(idCont);

        const cityCont = document.createElement('div');
        const cityInput = addInput(cityCont, {
            classes: [],
            label: 'city',
            labelName: 'Место назначения',
            type: 'text'
        });
        content!.appendChild(cityCont);

        const modalButtons = modal.querySelector('.modal-buttons');

        const approveBtn = document.createElement('img');
        approveBtn.src = '../assets/approve.png';
        approveBtn.alt = 'Approve';
        approveBtn.id = 'approve';
        approveBtn.addEventListener('click', async () => {
            if (!validateString(cityInput.value)) {
                alert(`Не заполнено поле ${cityInput.labels![0].innerText}`)
                return;
            }
            await query('destination', 'PUT', {
                id: id,
                value: cityInput.value,
            });

            const citySelects = document.querySelectorAll(`[id^='city']:not(.modal div)`);
            citySelects.forEach(citySelect => {
                const option = document.createElement('option');
                option.value = id;
                option.innerText = cityInput.value;

                citySelect.appendChild(option);
            });

            toggleModal();
        });
        modalButtons!.insertBefore(approveBtn, modalButtons!.firstChild);

        toggleModal();
    }
}

async function init(date: Date) {

    await clear(date);

    const result = await query('allOrders', 'GET');
    const rows: ICard[] = await result.json();
    for (const row of rows) {
        row.date = (new Date((new Date(row.date)).getTime() + 3 * 60 * 60 * 1000)).toISOString();
        await createListElement(row);
    }

    enableDragAndDrop();
}
